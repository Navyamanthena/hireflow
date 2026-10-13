import { Role } from '@app/common';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const PASSWORD_HINT = 'Password must be 10 to 128 characters';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  orgName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(10, { message: PASSWORD_HINT })
  @MaxLength(128, { message: PASSWORD_HINT })
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class CreateMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  /** Temporary password the admin shares with the new member. */
  @IsString()
  @MinLength(10, { message: PASSWORD_HINT })
  @MaxLength(128, { message: PASSWORD_HINT })
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
