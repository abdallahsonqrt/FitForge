import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER, StorageProvider } from './storage.types';
import { CloudflareR2StorageProvider } from './providers/cloudflare-r2.provider';

/**
 * Chooses the backend from `STORAGE_PROVIDER` and constructs exactly one.
 *
 * Adding AWS S3 or Google Cloud Storage later is a new class implementing
 * `StorageProvider` plus a case here — no consumer changes, because consumers
 * only ever see `StorageService`.
 */
const storageProviderFactory: Provider = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): StorageProvider => {
    const name = config.get<string>('STORAGE_PROVIDER') ?? 'r2';

    switch (name) {
      case 'r2':
        return new CloudflareR2StorageProvider(config);
      default:
        // Fail at boot rather than on the first upload: a typo'd provider name
        // must not look like a working configuration.
        throw new Error(
          `STORAGE_PROVIDER="${name}" has no implementation. Add a StorageProvider for it in src/storage/providers and register it here.`,
        );
    }
  },
};

@Module({
  providers: [storageProviderFactory, StorageService],
  exports: [StorageService],
})
export class StorageModule {
  constructor(private readonly storage: StorageService) {
    const logger = new Logger(StorageModule.name);
    logger.log(
      `Object storage: ${this.storage.providerName}` +
        (this.storage.isConfigured
          ? ` (new uploads are ${this.storage.defaultVisibility})`
          : ' — NOT CONFIGURED, uploads disabled'),
    );
  }
}
