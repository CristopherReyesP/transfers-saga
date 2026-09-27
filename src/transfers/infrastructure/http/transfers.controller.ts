import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExecuteTransfer } from '../../application/execute-transfer.js';
import { GetTransfer } from '../../application/get-transfer.js';
import { CreateTransferDto } from './create-transfer.dto.js';
import { IdempotencyKey } from './idempotency-key.js';
import { toTransferView, type TransferView } from './transfer-view.js';

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly executeTransfer: ExecuteTransfer,
    private readonly getTransfer: GetTransfer,
  ) {}

  /** Always 201, replays included: the status field carries the outcome. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @IdempotencyKey() idempotencyKey: string,
    @Body() body: CreateTransferDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TransferView> {
    const { sourceAccountId, destinationAccount, amount } = body;
    const transfer = await this.executeTransfer.execute({
      idempotencyKey,
      sourceAccountId,
      destinationAccount,
      amount,
    });
    response.location(`/transfers/${transfer.id}`);
    return toTransferView(transfer);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TransferView> {
    return toTransferView(await this.getTransfer.execute(id));
  }
}
