import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private readonly isInitialized: boolean = false;

  constructor(private configService: ConfigService) {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not set. ' +
          'Firebase token verification will be disabled. Falling back to JWT-only mode.',
      );
      return;
    }

    if (admin.apps.length === 0) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
        this.logger.log('Firebase Admin SDK initialized successfully.');
      } catch (error) {
        this.logger.error('Failed to initialize Firebase Admin SDK:', error);
        return;
      }
    }

    this.isInitialized = true;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.isInitialized) {
      throw new Error('Firebase is not initialized');
    }
    return admin.auth().verifyIdToken(token);
  }

  async getUserByEmail(email: string): Promise<admin.auth.UserRecord> {
    if (!this.isInitialized) {
      throw new Error('Firebase is not initialized');
    }
    return admin.auth().getUserByEmail(email);
  }

  async createUser(data: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<admin.auth.UserRecord> {
    if (!this.isInitialized) {
      throw new Error('Firebase is not initialized');
    }
    return admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
      emailVerified: true,
    });
  }

  async deleteUser(uid: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Firebase is not initialized');
    }
    return admin.auth().deleteUser(uid);
  }

  async listUsers(): Promise<admin.auth.ListUsersResult> {
    if (!this.isInitialized) {
      throw new Error('Firebase is not initialized');
    }
    return admin.auth().listUsers();
  }
}
