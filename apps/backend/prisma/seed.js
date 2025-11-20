'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
const client_1 = require('../../node_modules/.prisma/client');
const crypto = __importStar(require('crypto'));
const prisma = new client_1.PrismaClient();
function encryptPassword(password) {
  const algorithm = 'aes-256-ctr';
  const secretKeyRaw =
    process.env.ENCRYPTION_KEY || 'dev-secret-key-32-characters!!';
  const secretKey = crypto.createHash('sha256').update(secretKeyRaw).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(password), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}
async function main() {
  console.log('🌱 Starting seeding...');
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
  console.log('👤 Creating test user...');
  const testUser = await prisma.user.create({
    data: {
      phoneNumber: '+33612345678',
      email: 'test@example.com',
      role: 'MANAGER',
      status: 'ACTIVE',
      credits: 1000,
      whatsappProfile: {
        pseudo: 'Test User',
        avatar: 'https://via.placeholder.com/150',
        businessName: 'Ma Boutique Test',
      },
    },
  });
  console.log(`✅ User created: ${testUser.phoneNumber}`);
  console.log('🤖 Creating local WhatsApp Agent...');
  const whatsappAgent = await prisma.whatsAppAgent.create({
    data: {
      userId: testUser.id,
      ipAddress: 'localhost',
      port: 3002,
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
    `✅ WhatsApp Agent created: ${whatsappAgent.ipAddress}:${whatsappAgent.port}`,
  );
  console.log('🏷️  Creating system tags...');
  const systemTags = [
    { name: 'IA désactivée', color: '#EF4444', isSystem: true, userId: null },
    {
      name: 'Réponse manuelle requise',
      color: '#F59E0B',
      isSystem: true,
      userId: null,
    },
    {
      name: 'Promesse de commande',
      color: '#10B981',
      isSystem: true,
      userId: null,
    },
    { name: 'Spam', color: '#6B7280', isSystem: true, userId: null },
  ];
  for (const tag of systemTags) {
    await prisma.tag.create({ data: tag });
    console.log(`  ✓ Tag: ${tag.name}`);
  }
  console.log('📁 Creating system groups...');
  const systemGroups = [
    {
      name: "Groupe d'amélioration",
      type: 'IMPROVEMENT',
      isSystem: true,
      userId: null,
    },
    {
      name: 'Groupe de commandes',
      type: 'ORDERS',
      isSystem: true,
      userId: null,
    },
    {
      name: 'Groupe de support',
      type: 'SUPPORT',
      isSystem: true,
      userId: null,
    },
  ];
  for (const group of systemGroups) {
    await prisma.group.create({ data: group });
    console.log(`  ✓ Group: ${group.name}`);
  }
  console.log('🏪 Creating business info...');
  await prisma.businessInfo.create({
    data: {
      userId: testUser.id,
      name: 'Ma Boutique Test',
      description: 'Boutique de vente en ligne de produits divers',
      address: '123 Rue de la Paix',
      city: 'Paris',
      country: 'France',
      website: 'https://ma-boutique-test.com',
      openingHours: {
        monday: '09:00-18:00',
        tuesday: '09:00-18:00',
        wednesday: '09:00-18:00',
        thursday: '09:00-18:00',
        friday: '09:00-18:00',
        saturday: '10:00-17:00',
        sunday: 'Fermé',
      },
      phoneNumbers: ['+33612345678', '+33687654321'],
    },
  });
  console.log('✅ Business info created');
  console.log('📦 Creating test products...');
  const product1 = await prisma.product.create({
    data: {
      userId: testUser.id,
      name: 'T-shirt Rouge',
      description: 'Beau t-shirt rouge en coton',
      price: 25.99,
      currency: 'EUR',
      category: 'Vêtements',
      images: ['https://via.placeholder.com/300'],
      aiSuggestions: {
        spellingCorrections: [],
        metadataSuggestions: [
          { key: 'taille', values: ['S', 'M', 'L', 'XL'] },
          { key: 'matière', values: ['100% coton'] },
        ],
        descriptionImprovements: [
          'Ajouter plus de détails sur le style (col rond, manches courtes, etc.)',
        ],
      },
    },
  });
  await prisma.productMetadata.createMany({
    data: [
      {
        productId: product1.id,
        key: 'taille',
        value: 'M',
        isVisible: true,
        suggestedByAI: false,
      },
      {
        productId: product1.id,
        key: 'matière',
        value: '100% coton',
        isVisible: true,
        suggestedByAI: false,
      },
    ],
  });
  const product2 = await prisma.product.create({
    data: {
      userId: testUser.id,
      name: 'Jean Bleu',
      description: 'Jean bleu classique',
      price: 49.99,
      currency: 'EUR',
      category: 'Vêtements',
      images: ['https://via.placeholder.com/300'],
    },
  });
  console.log(`✅ Created ${2} products`);
  console.log('🚚 Creating delivery locations...');
  await prisma.deliveryLocation.createMany({
    data: [
      {
        userId: testUser.id,
        country: 'France',
        city: 'Paris',
        name: 'Centre-ville',
        price: 5.0,
        isActive: true,
      },
      {
        userId: testUser.id,
        country: 'France',
        city: 'Paris',
        name: 'Banlieue',
        price: 8.0,
        isActive: true,
      },
    ],
  });
  console.log('✅ Created delivery locations');
  console.log('💳 Creating payment methods...');
  await prisma.paymentMethod.createMany({
    data: [
      { userId: testUser.id, type: 'CASH', isActive: true },
      {
        userId: testUser.id,
        type: 'MOBILE_MONEY',
        mobileMoneyNumber: '+33612345678',
        mobileMoneyName: 'Test User',
        requiresProof: true,
        isActive: true,
      },
    ],
  });
  console.log('✅ Created payment methods');
  console.log('📝 Creating subscription...');
  const now = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);
  await prisma.subscription.create({
    data: {
      userId: testUser.id,
      tier: 'PRO',
      creditsIncluded: 5000,
      creditsUsed: 0,
      startDate: now,
      endDate: endDate,
      isActive: true,
      autoRenew: true,
    },
  });
  console.log('✅ Subscription created');
  console.log('💰 Creating credit history...');
  await prisma.credit.createMany({
    data: [
      {
        userId: testUser.id,
        amount: 1000,
        type: 'PURCHASE',
        description: 'Achat initial de crédits',
      },
      {
        userId: testUser.id,
        amount: 5000,
        type: 'SUBSCRIPTION',
        description: "Crédits de l'abonnement PRO",
      },
    ],
  });
  console.log('✅ Credit history created');
  console.log('');
  console.log('✨ Seeding completed successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`  - Users: 1`);
  console.log(`  - WhatsApp Agents: 1`);
  console.log(`  - System Tags: ${systemTags.length}`);
  console.log(`  - System Groups: ${systemGroups.length}`);
  console.log(`  - Products: 2`);
  console.log(`  - Delivery Locations: 2`);
  console.log(`  - Payment Methods: 2`);
  console.log('');
  console.log('🔑 Test credentials:');
  console.log(`  Phone: +33612345678`);
  console.log(`  Email: test@example.com`);
  console.log(`  Credits: 1000`);
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
//# sourceMappingURL=seed.js.map
