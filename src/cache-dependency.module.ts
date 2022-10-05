import { DynamicModule, Module } from '@nestjs/common';
import { CacheDependencyService } from './cache-dependency.service';

@Module({
  providers: [CacheDependencyService],
  exports: [CacheDependencyService],
})
export class CacheDependencyModule {
  static register(): DynamicModule {
    return {
      module: CacheDependencyModule,
      global: true,
    };
  }
}
