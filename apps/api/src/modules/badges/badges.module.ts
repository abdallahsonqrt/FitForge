import { Module } from '@nestjs/common';
import { BadgesService } from './badges.service';

/**
 * Badge awarding.
 *
 * No controller of its own: badges are *read* through `GET /progress/badges`,
 * which belongs to the progress module. This module exists so the write path —
 * "re-check what this user has earned" — can be imported by anything that
 * records progress, without those modules each re-deriving the rules.
 */
@Module({
  providers: [BadgesService],
  exports: [BadgesService],
})
export class BadgesModule {}
