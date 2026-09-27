import { Module } from '@nestjs/common';
import { TransfersModule } from './transfers/transfers.module.js';

@Module({
  imports: [TransfersModule],
})
export class AppModule {}
