import { Entity, Column, Unique } from "typeorm";
import { BaseAuditColumns } from "./base-audit-columns.entity";

@Entity("system_users")
@Unique(["email"])
export class User extends BaseAuditColumns {
  @Column({ type: "uuid" })
  role_id: string;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  email: string;

  @Column({ type: "varchar" })
  password: string;
}
