import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../../firebase/firebase.service';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private firebaseService: FirebaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Allow token via query param for SSE connections (EventSource can't set headers)
        (req) => req?.query?.token as string | null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      // passReqToCallback lets us intercept and try Firebase first
      passReqToCallback: true,
    });
  }

  /**
   * Called by Passport after the token is extracted but BEFORE the built-in JWT
   * signature verification. We override the default flow: try Firebase first,
   * fall back to the already-verified custom JWT payload.
   *
   * When passReqToCallback = true, Passport passes (req, payload) to validate().
   * However the built-in JWT verification has already run by the time validate()
   * is called — so we need to intercept at a higher level via authenticate().
   *
   * Strategy: authenticate() extracts the raw token, tries Firebase, and if that
   * fails falls back to the parent's standard JWT verification chain.
   */
  async authenticate(req: any): Promise<void> {
    // Extract raw token from request (same extractors as super config)
    const token =
      ExtractJwt.fromAuthHeaderAsBearerToken()(req) ??
      (req?.query?.token as string | undefined) ??
      null;

    if (!token) {
      this.fail({ message: 'No auth token provided' }, 401);
      return;
    }

    // --- Try Firebase ID token first ---
    if (this.firebaseService.initialized) {
      try {
        const decoded = await this.firebaseService.verifyIdToken(token);
        const user = await this.resolveUserFromFirebase(decoded);
        this.success(user);
        return;
      } catch {
        // Not a valid Firebase token — fall through to custom JWT verification
      }
    }

    // --- Fall back to custom JWT verification ---
    super.authenticate(req);
  }

  /**
   * Called by Passport after the custom JWT signature is verified successfully.
   * When passReqToCallback = true, the first argument is the request and
   * the second is the verified JWT payload.
   */
  async validate(_req: any, payload: JwtPayload) {
    return this.resolveUserFromJwtPayload(payload);
  }

  // ── Private helpers ───────────────────────────────────────

  private async resolveUserFromFirebase(decoded: import('firebase-admin').auth.DecodedIdToken) {
    const uid = decoded.uid;
    const email = decoded.email;

    // Look up by firebaseUid first, then fall back to email (backward compat)
    let user = await this.prisma.user.findFirst({
      where: { firebaseUid: uid, deletedAt: null },
      select: this.userSelect(),
    });

    if (!user && email) {
      // User exists but doesn't have firebaseUid yet — backfill it
      user = await this.prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: this.userSelect(),
      });

      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { firebaseUid: uid },
        });
        this.logger.log(`Backfilled firebaseUid for user ${user.email}`);
      }
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return this.hydrateUser(user);
  }

  private async resolveUserFromJwtPayload(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: this.userSelect(),
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return this.hydrateUser(user);
  }

  private userSelect() {
    return {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      deletedAt: true,
      companyUsers: {
        select: {
          company: { select: { id: true, name: true } },
        },
      },
    } as const;
  }

  private async hydrateUser(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: boolean;
    deletedAt: Date | null;
    companyUsers: { company: { id: string; name: string } }[];
  }) {
    // Resolve companyId: staff users use companyUsers, CLIENT users use their latest ParkingRecord
    // CLIENT users are not in company_users — their company is determined by their parking records
    let companyId: string | undefined = user.companyUsers?.[0]?.company?.id;
    if (!companyId) {
      const latestRecord = await this.prisma.parkingRecord.findFirst({
        where: { ownerId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { companyId: true },
      });
      companyId = latestRecord?.companyId ?? undefined;
    }

    const companyIds = user.companyUsers?.map((cu) => cu.company.id) ?? [];

    // Exclude deletedAt from the returned object — it's an internal field
    const { deletedAt: _deletedAt, ...userWithoutDeletedAt } = user;

    return { ...userWithoutDeletedAt, companyId, companyIds };
  }
}
