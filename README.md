# nestjs-cache-dependency

## Description

Cache dependency for Nestjs.

A cache data item will associate with one or multiple dependency keys. By invalidating a dependency key, all cache data items that are associated with it will be invalidated either. 

It is useful in case we have a lot of relevant data such as a list with pagination or user data.

## Installation

```bash
$ npm i --save nestjs-cache-dependency
```

## Usage

Register `CacheDependencyModule`:

```typescript
import { CacheDependencyModule } from 'nestjs-cache-dependency';

@Module({
  imports: [
    CacheDependencyModule.register(),
    ...
  ],
  providers: [...],
})
export class AppModule {}
```

Inject `CacheDependencyService`:
```typescript
@Injectable()
export class MyService {
  constructor(private readonly cacheDependencyService: CacheDependencyService) {}
}
```

## Examples 
```typescript
// Set multiple cache with a dependency key 'user-123'
await this.cacheDependencyService.set('user_42_profile', 'myprofile', 30, [
  'user-123',
]);
await this.cacheDependencyService.set('user_42_stats', 'mystats', 30, [
  'user-123',
]);

// Get data from cache
console.log(await this.cacheDependencyService.get('user_42_profile')); //'myprofile'
console.log(await this.cacheDependencyService.get('user_42_stats')); //'mystats'

// invalidating cache data associate with 'user-123'
await this.cacheDependencyService.invalidate(['user-123']);

// Get data from cache
console.log(await this.cacheDependencyService.get('user_42_profile')); //null
console.log(await this.cacheDependencyService.get('user_42_stats')); //null
```