import { CatalogModule } from '@app/catalog/catalog.module';
import { ConnectorModule } from '@app/connector/connector.module';
import { PageScriptModule } from '@app/page-scripts/page-script.module';
import { PrismaModule } from '@app/prisma/prisma.module';
import { Module } from '@nestjs/common';

import { CatalogTools } from './catalog/catalog.tools';
import { AdminGroupMessagingService } from './chat/admin-group-messaging.service';
import { ChatTools } from './chat/chat.tools';
import { CommunicationTools } from './communication/communication.tools';
import { ProductSendService } from './communication/product-send.service';
import { ContactResolverService } from './contact/contact-resolver.service';
import { GroupTools } from './group/group.tools';
import { IntentTools } from './intent/intent.tools';
import { LabelsTools } from './labels/labels.tools';
import { MemoryTools } from './memory/memory.tools';

@Module({
  imports: [
    PrismaModule,
    ConnectorModule,
    CatalogModule, // Provides semantic search and sync
    PageScriptModule, // Provides script loading from files
  ],
  providers: [
    CommunicationTools,
    ProductSendService,
    ContactResolverService,
    AdminGroupMessagingService,
    CatalogTools,
    ChatTools,
    GroupTools,
    LabelsTools,
    MemoryTools,
    IntentTools,
  ],
  exports: [
    CommunicationTools,
    ProductSendService,
    ContactResolverService,
    AdminGroupMessagingService,
    CatalogTools,
    ChatTools,
    GroupTools,
    LabelsTools,
    MemoryTools,
    IntentTools,
  ],
})
export class ToolsModule {}
