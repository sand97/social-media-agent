import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import PasswordGuard from '../guards/password.guard';

import { InfraAdminTokenDto } from './dto/infra-admin-token.dto';
import { ListProvisioningServersDto } from './dto/list-provisioning-servers.dto';
import { ProvisionStackCapacityDto } from './dto/provision-stack-capacity.dto';
import { ReconcileStackPoolDto } from './dto/reconcile-stack-pool.dto';
import { WorkflowCallbackDto } from './dto/workflow-callback.dto';
import { StackPoolService } from './stack-pool.service';

@ApiTags('infra-stack-pool')
@UseGuards(PasswordGuard('INFRA_ADMIN_TOKEN'))
@Controller('infra/stack-pool')
export class InfraStackPoolController {
  constructor(private readonly stackPoolService: StackPoolService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Résumé du stock de stacks et des workflows en cours',
  })
  async getSummary(@Query() _: InfraAdminTokenDto) {
    return this.stackPoolService.getCapacitySummary();
  }

  @Get('servers')
  @ApiOperation({
    summary: 'Lister les VPS provisionnés avec pagination et filtres.',
  })
  async listServers(@Query() query: ListProvisioningServersDto) {
    return this.stackPoolService.listProvisioningServers(query);
  }

  @Get('servers/free')
  @ApiOperation({
    summary: 'Lister les VPS avec des stacks libres',
  })
  async listFreeVps(@Query() _: InfraAdminTokenDto) {
    return this.stackPoolService.listVpsWithFreeStacks();
  }

  @Post('provision')
  @ApiOperation({
    summary: 'Demander le provisionnement manuel de nouveaux VPS/stacks',
  })
  @ApiResponse({
    status: 201,
    description: 'Workflow(s) GitHub dispatché(s)',
  })
  async provision(@Body() dto: ProvisionStackCapacityDto) {
    return this.stackPoolService.provisionCapacity(dto, null);
  }

  @Post('reconcile')
  @ApiOperation({
    summary: 'Vérifier et rétablir le stock minimal de stacks libres',
  })
  async reconcile(@Body() _: ReconcileStackPoolDto) {
    await this.stackPoolService.reconcileCapacity({
      reason: 'manual-reconcile',
    });

    return this.stackPoolService.getCapacitySummary();
  }
}

@Controller('stack-pool')
export class StackPoolWorkflowsController {
  constructor(private readonly stackPoolService: StackPoolService) {}

  @Post('workflows/callback')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: 'Callback interne appelé par les workflows GitHub',
  })
  async workflowCallback(
    @Body() dto: WorkflowCallbackDto,
    @Headers('x-infra-callback-secret') callbackSecret?: string,
  ) {
    return this.stackPoolService.handleWorkflowCallback({
      ...dto,
      callbackSecret: callbackSecret || dto.callbackSecret,
    });
  }
}
