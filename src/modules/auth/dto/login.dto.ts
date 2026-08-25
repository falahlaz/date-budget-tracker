import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'falah@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(191)
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @MinLength(1, { message: 'password is required' })
  @MaxLength(200)
  password!: string;
}
