import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateAccountDto {
  @IsEmail()
  public email!: string;

  @IsString()
  @IsNotEmpty()
  public name!: string;

  @IsString()
  @IsNotEmpty()
  public cellphone!: string;

  @IsString()
  @IsNotEmpty()
  public taxId!: string;

  @IsNumber()
  @Min(0.01)
  public amount!: number;

  @Matches(/^[A-Z]{3}$/)
  public currency!: string;
}
