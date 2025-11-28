import { CatalogModule } from '@app/catalog/catalog.module';
import { ConnectorModule } from '@app/connector/connector.module';
import { PageScriptModule } from '@app/page-scripts/page-script.module';
import { PrismaModule } from '@app/prisma/prisma.module';
import { QueueModule } from '@app/queue/queue.module';
import { Module } from '@nestjs/common';

import { CatalogTools } from './catalog/catalog.tools';
import { CommunicationTools } from './communication/communication.tools';
import { IntentTools } from './intent/intent.tools';
import { LabelsTools } from './labels/labels.tools';
import { MemoryTools } from './memory/memory.tools';
import { MessagesTools } from './messages/messages.tools';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    ConnectorModule,
    CatalogModule, // Provides semantic search and sync
    PageScriptModule, // Provides script loading from files
  ],
  providers: [
    CommunicationTools,
    CatalogTools,
    LabelsTools,
    MemoryTools,
    MessagesTools,
    IntentTools,
  ],
  exports: [
    CommunicationTools,
    CatalogTools,
    LabelsTools,
    MemoryTools,
    MessagesTools,
    IntentTools,
  ],
})
export class ToolsModule {}
