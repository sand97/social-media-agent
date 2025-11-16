import { PartialType } from '@nestjs/swagger';
import { CreateDeliveryLocationDto } from './create-delivery-location.dto';

export class UpdateDeliveryLocationDto extends PartialType(
  CreateDeliveryLocationDto,
) {}
