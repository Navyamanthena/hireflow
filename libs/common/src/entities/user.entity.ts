import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

/**
 * admin:     everything a recruiter can do, plus deleting roles/candidates
 *            and managing team members.
 * recruiter: open roles, add and move candidates, rescore, edit rules.
 */
export enum Role {
  ADMIN = 'admin',
  RECRUITER = 'recruiter',
}

@Entity('users')
@Index('uq_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'org_id' })
  orgId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  org: Organization;

  /** Stored lower-cased; uniqueness is global so login needs no org picker. */
  @Column({ length: 320 })
  email: string;

  @Column({ length: 200 })
  name: string;

  /** scrypt$N$r$p$salt$hash, never returned by the API. */
  @Column({ name: 'password_hash', length: 300, select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.RECRUITER })
  role: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
