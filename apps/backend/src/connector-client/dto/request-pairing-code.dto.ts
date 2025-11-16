import { IsString, IsNotEmpty } from 'class-validator';

export class RequestPairingCodeDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
