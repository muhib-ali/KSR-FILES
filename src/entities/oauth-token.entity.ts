import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseAuditColumns } from "./base-audit-columns.entity";
import { User } from "./user.entity";

@Entity("oauth_tokens")
@Index(["token"])
@Index(["userId"])
export class OauthToken extends BaseAuditColumns {
  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  token: string;

  @Column({ type: "varchar" })
  refresh_token: string;

  @Column({ type: "timestamptz" })
  expires_at: Date;

  @Column({ type: "boolean", default: false })
  revoked: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}
