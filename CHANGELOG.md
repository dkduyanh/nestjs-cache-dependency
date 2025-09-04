Changelog
==========================
3.0.1 (2025-09-04)
------------------------
- Fix error "undefined" is not valid JSON while retrieving data from the cache.

3.0.0 (2025-04-26)
------------------------
- Add NestJS v11 support
- Change License from ISC to MIT
- BREAKING CHANGES:
  - `get: <T>(key: string) => Promise<T | null>` Gets a saved value from the cache. Returns a 'null' if not found or expired instead of 'undefined'

2.0.0 (2023-07-18)
------------------------
- Add NestJS v10 support.
- Add new @nest/cache-manager as a drop-in replacement for the deprecated built-in CacheModule.
- Support multi caching.
- Change ttl datatype back as an integer instead of an object (see 1.0.8).
- Add cache-manager v5 support. 
  - If using cache-manager v4, provide ttl in seconds. 
  - If using cache-manager v5, provide ttl in milliseconds

1.0.8 (2023-01-19)
------------------------
- Fix unable to set cache via Cache-Manager when using ttl as 3rd param.

1.0.6 (2022-10-28)
------------------------
- Add cache delete api.

1.0.5 (2022-10-24)
------------------------
- Update variable and return type declarations.

1.0.4 (2022-10-05)
------------------------
- Downgrade the cache-manager from v5 to v4 due to incompatible issue.

1.0.0 (2022-10-04)
------------------------
- The first official release.