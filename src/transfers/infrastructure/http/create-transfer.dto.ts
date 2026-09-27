import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

// The DTO checks the shape only; Money owns the amount and currency rules and
// answers InvalidAmount or InvalidCurrency.
export class AmountDto {
  @IsInt()
  minorUnits: number;

  @IsString()
  currency: string;
}

export class CreateTransferDto {
  // Lengths match the VARCHAR2(64) columns, so an oversized id never reaches Oracle.
  @IsString()
  @Length(1, 64)
  sourceAccountId: string;

  @IsString()
  @Length(1, 64)
  destinationAccount: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AmountDto)
  amount: AmountDto;
}
