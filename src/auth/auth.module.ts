import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";

import { JwtStrategy } from "./jwt.strategy";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OauthToken } from "../entities/oauth-token.entity";
import { User } from "../entities/user.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OauthToken]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || "your-secret-key",
        signOptions: {
          expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
