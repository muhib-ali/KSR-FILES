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

    const user = await this.userRepository.findOne({ where: { id: userId } });
    return user || null;
  }
}
