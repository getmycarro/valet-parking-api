import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Allow token via query param for SSE connections (EventSource can't set headers)
        (req) => req?.query?.token as string | null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        companyUsers: {
          select: {
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

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

    return { ...user, companyId, companyIds }; // companyId = primary, companyIds = all companies for staff
  }
}
