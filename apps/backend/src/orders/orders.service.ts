import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order, OrderStatus } from '@app/generated/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all orders for a user, optionally filtered by status
   */
  async getAllForUser(userId: string, status?: OrderStatus) {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        conversation: true,
        deliveryLocation: true,
        paymentMethod: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get order by ID with conversation, delivery, payment
   */
  async getById(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        conversation: true,
        deliveryLocation: true,
        paymentMethod: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this order',
      );
    }

    return order;
  }

  /**
   * Create a new order
   */
  async create(userId: string, data: CreateOrderDto): Promise<Order> {
    // Validate required fields
    if (!data.conversationId || data.conversationId.trim() === '') {
      throw new BadRequestException('Conversation ID is required');
    }

    if (!data.customerName || data.customerName.trim() === '') {
      throw new BadRequestException('Customer name is required');
    }

    if (!data.customerPhone || data.customerPhone.trim() === '') {
      throw new BadRequestException('Customer phone is required');
    }

    if (!data.products) {
      throw new BadRequestException('Products are required');
    }

    if (!data.totalAmount || data.totalAmount <= 0) {
      throw new BadRequestException('Total amount must be greater than 0');
    }

    // Verify conversation ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: data.conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to create an order for this conversation',
      );
    }

    // Verify delivery location if provided
    if (data.deliveryLocationId) {
      const deliveryLocation = await this.prisma.deliveryLocation.findUnique({
        where: { id: data.deliveryLocationId },
      });

      if (!deliveryLocation) {
        throw new NotFoundException('Delivery location not found');
      }

      if (deliveryLocation.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to use this delivery location',
        );
      }
    }

    // Verify payment method if provided
    if (data.paymentMethodId) {
      const paymentMethod = await this.prisma.paymentMethod.findUnique({
        where: { id: data.paymentMethodId },
      });

      if (!paymentMethod) {
        throw new NotFoundException('Payment method not found');
      }

      if (paymentMethod.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to use this payment method',
        );
      }
    }

    return this.prisma.order.create({
      data: {
        userId,
        conversationId: data.conversationId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        products: data.products,
        totalAmount: data.totalAmount,
        deliveryLocationId: data.deliveryLocationId || null,
        paymentMethodId: data.paymentMethodId || null,
        promiseDate: data.promiseDate ? new Date(data.promiseDate) : null,
      },
      include: {
        conversation: true,
        deliveryLocation: true,
        paymentMethod: true,
      },
    });
  }

  /**
   * Update an existing order
   */
  async update(
    orderId: string,
    userId: string,
    data: UpdateOrderDto,
  ): Promise<Order> {
    // Verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this order',
      );
    }

    // Verify delivery location if provided
    if (data.deliveryLocationId) {
      const deliveryLocation = await this.prisma.deliveryLocation.findUnique({
        where: { id: data.deliveryLocationId },
      });

      if (!deliveryLocation) {
        throw new NotFoundException('Delivery location not found');
      }

      if (deliveryLocation.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to use this delivery location',
        );
      }
    }

    // Verify payment method if provided
    if (data.paymentMethodId) {
      const paymentMethod = await this.prisma.paymentMethod.findUnique({
        where: { id: data.paymentMethodId },
      });

      if (!paymentMethod) {
        throw new NotFoundException('Payment method not found');
      }

      if (paymentMethod.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to use this payment method',
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (data.customerName !== undefined)
      updateData.customerName = data.customerName;
    if (data.customerPhone !== undefined)
      updateData.customerPhone = data.customerPhone;
    if (data.products !== undefined) updateData.products = data.products;
    if (data.totalAmount !== undefined) updateData.totalAmount = data.totalAmount;
    if (data.deliveryLocationId !== undefined)
      updateData.deliveryLocationId = data.deliveryLocationId;
    if (data.paymentMethodId !== undefined)
      updateData.paymentMethodId = data.paymentMethodId;
    if (data.promiseDate !== undefined)
      updateData.promiseDate = data.promiseDate ? new Date(data.promiseDate) : null;
    if (data.status !== undefined) updateData.status = data.status;

    return this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        conversation: true,
        deliveryLocation: true,
        paymentMethod: true,
      },
    });
  }

  /**
   * Update order status
   */
  async updateStatus(
    orderId: string,
    userId: string,
    status: OrderStatus,
  ): Promise<Order> {
    // Verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this order',
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: {
        conversation: true,
        deliveryLocation: true,
        paymentMethod: true,
      },
    });
  }

  /**
   * Mark order as delivered
   */
  async markAsDelivered(orderId: string, userId: string): Promise<Order> {
    // Verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this order',
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
      },
      include: {
        conversation: true,
        deliveryLocation: true,
        paymentMethod: true,
      },
    });
  }

  /**
   * Get orders for a conversation
   */
  async getByConversation(conversationId: string, userId: string) {
    // Verify conversation ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this conversation',
      );
    }

    return this.prisma.order.findMany({
      where: { conversationId },
      include: {
        conversation: true,
        deliveryLocation: true,
        paymentMethod: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
