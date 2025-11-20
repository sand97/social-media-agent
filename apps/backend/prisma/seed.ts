import { PrismaClient } from '../src/generated/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// Fonction simple de cryptage pour le développement
// TODO: Utiliser un vrai système de cryptage en production
function encryptPassword(password: string): string {
  const algorithm = 'aes-256-ctr';
  // La clé doit faire exactement 32 bytes pour aes-256
  const secretKeyRaw =
    process.env.ENCRYPTION_KEY || 'dev-secret-key-32-characters!!';
  const secretKey = crypto.createHash('sha256').update(secretKeyRaw).digest(); // 32 bytes
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(password), cipher.final()]);

  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

async function main() {
  console.log('🌱 Starting seeding...');

  // Nettoyer la base de données (développement uniquement)
  console.log('🧹 Cleaning database...');
  await prisma.conversationTag.deleteMany();
  await prisma.message.deleteMany();
  await prisma.order.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.productMetadata.deleteMany();
  await prisma.product.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.group.deleteMany();
  await prisma.deliveryLocation.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.credit.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.businessInfo.deleteMany();
  await prisma.whatsAppAgent.deleteMany();
  await prisma.user.deleteMany();

  // Créer un WhatsApp Agent local pour le développement
  console.log('🤖 Creating local WhatsApp Agent...');
  const whatsappAgent = await prisma.whatsAppAgent.create({
    data: {
      ipAddress: 'localhost',
      port: 3002, // Port de l'agent
      connectorPort: 3001, // Port du connector
      encryptedPassword: encryptPassword('dev-password'),
      status: 'RUNNING',
      connectionStatus: 'CONNECTED',
      metadata: {
        environment: 'development',
        containerIddocker: 'local-dev',
      },
    },
  });
  console.log(
    `✅ WhatsApp Agent created: ${whatsappAgent.ipAddress}:${whatsappAgent.port} (connector: ${whatsappAgent.connectorPort})`,
  );
  console.log('✨ Seeding completed successfully!');
  console.log(`  WhatsApp Agent: localhost:3002`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
