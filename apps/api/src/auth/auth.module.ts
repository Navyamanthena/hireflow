import { User } from '@app/common';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { jwtExpiresIn, jwtSecret } from './auth.config';
import { AuthController, TeamController } from './auth.controller';
import { JwtAuthGuard, RolesGuard } from './auth.guards';
import { AuthService } from './auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { algorithm: 'HS256', expiresIn: jwtExpiresIn() as never },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
  ],
  controllers: [AuthController, TeamController],
  providers: [
    AuthService,
    // Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
