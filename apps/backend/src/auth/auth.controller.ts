import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

import { AuthService } from './auth.service';
import { ConfirmPairingDto } from './dto/confirm-pairing.dto';
import { RefreshQrDto } from './dto/refresh-qr.dto';
import { RequestPairingDto } from './dto/request-pairing.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyPairingDto } from './dto/verify-pairing.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-pairing')
  @ApiOperation({
    summary: 'Request pairing code or check connection',
    description:
      'Request a pairing code to link WhatsApp account with the application. If the account is already connected, an OTP will be sent instead. For desktop devices, returns a QR scenario.',
  })
  @ApiResponse({
    status: 201,
    description: 'Pairing initiated successfully',
    schema: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['otp', 'pairing', 'qr'],
          example: 'otp',
        },
        code: { type: 'string', example: '12345678' },
        pairingToken: { type: 'string', example: 'token123...' },
        message: {
          type: 'string',
          example: 'Un code de vérification a été envoyé',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid parameters',
  })
  async requestPairingCode(@Body() dto: RequestPairingDto) {
    return this.authService.requestPairingCode(
      dto.phoneNumber,
      dto.deviceType || 'mobile',
    );
  }

  @Post('request-qr')
  @ApiOperation({
    summary: 'Request QR code',
    description:
      'Request a QR code to link WhatsApp account with the application (desktop)',
  })
  @ApiResponse({
    status: 201,
    description: 'QR code generated successfully',
    schema: {
      type: 'object',
      properties: {
        qrCode: { type: 'string', example: '1@abc123...' },
        pairingToken: { type: 'string', example: 'token123...' },
        message: {
          type: 'string',
          example: 'Scannez le code QR avec WhatsApp',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - QR code not available',
  })
  async requestQRCode(@Body() dto: RequestPairingDto) {
    return this.authService.requestCodeQR(dto.phoneNumber);
  }

  @Post('refresh-qr')
  @ApiOperation({
    summary: 'Refresh QR code',
    description:
      'Request a new QR code when the current one expires. This will restart the connector to generate a fresh QR code.',
  })
  @ApiResponse({
    status: 201,
    description: 'QR code refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        qrCode: { type: 'string', example: '1@abc123...' },
        pairingToken: { type: 'string', example: 'token123...' },
        message: {
          type: 'string',
          example: 'Nouveau code QR généré',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid pairing token',
  })
  async refreshQRCode(@Body() body: RefreshQrDto) {
    return this.authService.refreshCodeQR(
      body.pairingToken,
      body.qrSessionToken,
    );
  }

  @Post('verify-pairing')
  @ApiOperation({
    summary: 'Verify pairing success',
    description:
      'Verify that WhatsApp pairing was successful (called by webhook from connector)',
  })
  @ApiResponse({
    status: 201,
    description: 'Pairing verified successfully',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            phoneNumber: { type: 'string' },
            status: { type: 'string' },
            whatsappProfile: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async verifyPairing(@Body() dto: VerifyPairingDto) {
    return this.authService.verifyPairingSuccess(
      dto.phoneNumber,
      dto.whatsappProfile,
    );
  }

  @Post('confirm-pairing')
  @ApiOperation({
    summary: 'Confirm pairing completion or verify OTP',
    description:
      'Called by frontend to confirm pairing (new device) or verify OTP code (existing connection). The endpoint automatically detects which scenario to handle based on the presence of an OTP in cache.',
  })
  @ApiResponse({
    status: 201,
    description: 'Pairing/OTP confirmed successfully',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            phoneNumber: { type: 'string' },
            status: { type: 'string' },
            whatsappProfile: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired pairing token / Invalid OTP code',
  })
  @ApiResponse({
    status: 400,
    description:
      'WhatsApp connection not yet confirmed / OTP code required but not provided',
  })
  async confirmPairing(@Body() dto: ConfirmPairingDto) {
    return this.authService.confirmPairing(dto.pairingToken, dto.otpCode);
  }

  @Post('verify-otp')
  @ApiOperation({
    summary: 'Verify OTP code',
    description: 'Verify OTP code and complete login',
  })
  @ApiResponse({
    status: 201,
    description: 'OTP verified successfully',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            phoneNumber: { type: 'string' },
            status: { type: 'string' },
            whatsappProfile: { type: 'object' },
            lastLoginAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP',
  })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOTP(dto.phoneNumber, dto.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description: 'Get the currently authenticated user information',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user information',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        phoneNumber: { type: 'string' },
        status: { type: 'string' },
        whatsappProfile: { type: 'object' },
        googleContacts: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            contactsCount: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getMe(@Request() req) {
    return req.user;
  }
}
