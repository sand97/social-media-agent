import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { CreateDeliveryLocationDto } from './dto/create-delivery-location.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@ApiTags('settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ==================== BUSINESS INFO ====================

  @Get('business')
  @ApiOperation({ summary: 'Get business information' })
  @ApiResponse({
    status: 200,
    description: 'Business information retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Business information not found' })
  async getBusinessInfo(@Request() req: any) {
    return this.settingsService.getBusinessInfo(req.user.userId);
  }

  @Patch('business')
  @ApiOperation({ summary: 'Update business information' })
  @ApiResponse({
    status: 200,
    description: 'Business information updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateBusinessInfo(
    @Request() req: any,
    @Body() updateBusinessInfoDto: UpdateBusinessInfoDto,
  ) {
    return this.settingsService.updateBusinessInfo(
      req.user.userId,
      updateBusinessInfoDto,
    );
  }

  // ==================== DELIVERY LOCATIONS ====================

  @Get('delivery-locations')
  @ApiOperation({ summary: 'Get all delivery locations' })
  @ApiResponse({
    status: 200,
    description: 'Delivery locations retrieved successfully',
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getDeliveryLocations(@Request() req: any) {
    return this.settingsService.getDeliveryLocations(req.user.userId);
  }

  @Post('delivery-locations')
  @ApiOperation({ summary: 'Create a new delivery location' })
  @ApiResponse({
    status: 201,
    description: 'Delivery location created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createDeliveryLocation(
    @Request() req: any,
    @Body() createDeliveryLocationDto: CreateDeliveryLocationDto,
  ) {
    return this.settingsService.createDeliveryLocation(
      req.user.userId,
      createDeliveryLocationDto,
    );
  }

  @Patch('delivery-locations/:id')
  @ApiOperation({ summary: 'Update a delivery location' })
  @ApiResponse({
    status: 200,
    description: 'Delivery location updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Delivery location not found' })
  async updateDeliveryLocation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateDeliveryLocationDto: UpdateDeliveryLocationDto,
  ) {
    return this.settingsService.updateDeliveryLocation(
      id,
      req.user.userId,
      updateDeliveryLocationDto,
    );
  }

  @Delete('delivery-locations/:id')
  @ApiOperation({ summary: 'Delete a delivery location' })
  @ApiResponse({
    status: 200,
    description: 'Delivery location deleted successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Delivery location not found' })
  async deleteDeliveryLocation(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.settingsService.deleteDeliveryLocation(
      id,
      req.user.userId,
    );
  }

  // ==================== PAYMENT METHODS ====================

  @Get('payment-methods')
  @ApiOperation({ summary: 'Get all payment methods' })
  @ApiResponse({
    status: 200,
    description: 'Payment methods retrieved successfully',
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getPaymentMethods(@Request() req: any) {
    return this.settingsService.getPaymentMethods(req.user.userId);
  }

  @Post('payment-methods')
  @ApiOperation({ summary: 'Create a new payment method' })
  @ApiResponse({
    status: 201,
    description: 'Payment method created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createPaymentMethod(
    @Request() req: any,
    @Body() createPaymentMethodDto: CreatePaymentMethodDto,
  ) {
    return this.settingsService.createPaymentMethod(
      req.user.userId,
      createPaymentMethodDto,
    );
  }

  @Patch('payment-methods/:id')
  @ApiOperation({ summary: 'Update a payment method' })
  @ApiResponse({
    status: 200,
    description: 'Payment method updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Payment method not found' })
  async updatePaymentMethod(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
  ) {
    return this.settingsService.updatePaymentMethod(
      id,
      req.user.userId,
      updatePaymentMethodDto,
    );
  }

  @Delete('payment-methods/:id')
  @ApiOperation({ summary: 'Delete a payment method' })
  @ApiResponse({
    status: 200,
    description: 'Payment method deleted successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Payment method not found' })
  async deletePaymentMethod(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.settingsService.deletePaymentMethod(
      id,
      req.user.userId,
    );
  }
}
