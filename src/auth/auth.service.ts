import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OauthToken } from "../entities/oauth-token.entity";
import { User } from "../entities/user.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(OauthToken)
    private tokenRepository: Repository<OauthToken>,
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}

  async validateToken(token: string | undefined, userId: string): Promise<User | null> {
    if (!token) {
      return null;
    }

    const tokenRecord = await this.tokenRepository.findOne({
      where: {
        token,
        revoked: false,
      },
    });

    if (!tokenRecord) {
      return null;
    }

    if (tokenRecord.expires_at < new Date()) {
      return null;
    }

    const user = await this.userRepository.findOne({ where: { id: tokenRecord.userId } });
    return user || null;
  }

  /**
   * Validate token from DB, or accept JWT payload when token is issued by shared issuer (e.g. KSR-ADMIN)
   * so that Admin-frontend tokens work without being stored in KSR-FILES DB.
   */
  async validateTokenOrPayload(
    token: string | undefined,
    payload: { sub?: string },
  ): Promise<User | { id: string } | null> {
    const user = await this.validateToken(token, payload?.sub ?? "");
    if (user) return user;
    if (payload?.sub) {
      const byId = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (byId) return byId;
      return { id: payload.sub };
    }
    return null;
  }
}
