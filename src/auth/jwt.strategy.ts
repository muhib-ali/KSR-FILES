import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService } from "./auth.service";

/** Allow tokens expired up to this long ago (for long chunked uploads so expiry never blocks upload). */
const EXPIRY_GRACE_SEC = 2 * 60 * 60; // 2 hours

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true, // we enforce expiry in validate() with grace for uploads
      secretOrKey: process.env.JWT_SECRET || "your-secret-key",
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp != null && now > payload.exp + EXPIRY_GRACE_SEC) {
      return null; // expired more than grace period ago
    }
    const token = req.headers.authorization?.split(" ")[1];
    const user = await this.authService.validateTokenOrPayload(token, payload);
    if (!user) {
      return null;
    }
    return user;
  }
}
