import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MultiCache } from 'cache-manager';
import * as isEqual from 'lodash.isequal';
import { isNil } from "@nestjs/common/utils/shared.utils";

@Injectable()
export class CacheDependencyService {
  constructor(
    @Inject(CACHE_MANAGER)
    private cacheManager: MultiCache,
  ) {}

  /**
   * Set cache with dependency keys
   * @param key string cache key
   * @param value cache value
   * @param ttl Time to live - amount of time in seconds that a response is cached before it is deleted
   * @param dependencyKeys
   */
  async set<T>(
    key: string,
    value: T,
    ttl: number,
    dependencyKeys: string[],
  ): Promise<any> {
    const cacheKey = this._buildDataCacheKey(key);

    //validate dependencies
    if (dependencyKeys === null || dependencyKeys === undefined) {
      dependencyKeys = [];
    } else if (!Array.isArray(dependencyKeys)) {
      dependencyKeys = [dependencyKeys];
    }

    dependencyKeys = dependencyKeys.map(dependency => {
      return this._buildDependencyCacheKey(dependency);
    });

    const dependencies: Dependency[] = await this._generateDependencyVersions(
      dependencyKeys,
    );

    //Set cache with dependencies
    return await this.cacheManager.set(
      cacheKey,
      JSON.stringify([value, dependencies]),
      !isNil(ttl) ? ttl: undefined,
    );
  }

  /**
   * Get cached data
   * @param key string cache key
   */
  public async get<T>(key: string): Promise<T | undefined> {
    const cacheKey = this._buildDataCacheKey(key);
    const cachedData = await this.cacheManager.get<string>(cacheKey);

    if (cachedData !== undefined) {
      const data = JSON.parse(cachedData);
      const isValid = await this._validateDependencyVersions(data);
      if (isValid) {
        return data[0];
      }
    }
    return undefined;
  }

  /**
   * Delete cached data without invalidate dependencies
   * @param key string cache key
   */
  public async delete(key: string): Promise<any> {
    const cacheKey = this._buildDataCacheKey(key);
    return await this.cacheManager.del(cacheKey);
  }

  /**
   * Invalidates all the cached data items that are associated with any of the specified dependencies.
   * @param dependencyKeys Array of dependency keys
   * @return TRUE on success, FALSE otherwise.
   */
  public async invalidate(
    dependencyKeys: string | Array<string>,
  ): Promise<boolean> {
    if (dependencyKeys) {
      if (!Array.isArray(dependencyKeys)) {
        dependencyKeys = [dependencyKeys];
      }
      dependencyKeys = dependencyKeys.map(e => {
        return this._buildDependencyCacheKey(e);
      });
      //touch to change dependency versions
      await this._updateDependencyVersions(dependencyKeys);
      return true;
    }
    return false;
  }

  /**
   * Generate dependency versions (timestamps) for the specified dependencies.
   * This function will try to pull the dependency's versions from cache first.
   * Then force to generate version of unavailable dependencies by calling {this._updateDependencyVersions}
   *
   * @param dependencyKeys Array of dependency keys
   * @return Array of Dependency objects
   * @protected
   */
  protected async _generateDependencyVersions(
    dependencyKeys: Array<string>,
  ): Promise<Dependency[]> {
    //Find all current dependencies
    let currentDependencies: Dependency[] = await this._getDependencyVersions(
      dependencyKeys,
    );

    //Find all unavailable dependencies, which don't have version (timestamp)
    const newDependencyKeys: string[] = [];
    for (const d of currentDependencies) {
      if (d.version === undefined) {
        newDependencyKeys.push(d.key);
      }
    }

    //If there are unavailable dependencies --> Try to generate versions for them
    if (newDependencyKeys.length > 0) {
      const newDependencies: Dependency[] =
        await this._updateDependencyVersions(newDependencyKeys);

      //Merge new dependencies into the current ones
      currentDependencies = this._mergeDependencyVersions(
        currentDependencies,
        newDependencies,
      );
    }
    return currentDependencies;
  }

  /**
   * List of dependency keys
   * @param dependencyKeys Array of dependency keys
   * @return Array of Dependency objects
   * @protected
   */
  protected async _getDependencyVersions(
    dependencyKeys: Array<string>,
  ): Promise<Dependency[]> {
    const itemObjects: Dependency[] = [];
    if (Array.isArray(dependencyKeys) && dependencyKeys.length > 0) {
      for (const e of dependencyKeys) {
        itemObjects.push({
          key: e,
          version: await this.cacheManager.get(e),
        });
      }
    }
    return itemObjects;
  }

  /**
   * Touch the dependencies to mark them have been changed.
   * This function will force to update new version (timestamp) for all specified dependencies
   * @param dependencyKeys Array of dependency keys
   * @return Array of Dependency objects
   * @protected
   */
  protected async _updateDependencyVersions(
    dependencyKeys: Array<string>,
  ): Promise<Dependency[]> {
    const itemObjects = [];
    const version = String(Date.now());

    if (Array.isArray(dependencyKeys) && dependencyKeys.length > 0) {
      for (let i = 0; i < dependencyKeys.length; i++) {
        await this.cacheManager.set(dependencyKeys[i], version, 0);
        itemObjects.push({ key: dependencyKeys[i], version: version });
      }
    }
    return itemObjects;
  }

  /**
   * Merge new list of dependency versions to the current.
   * @param arr1 array of current dependency versions
   * @param arr2 new list of dependency versions need to be merged
   * @return the list of versions (timestamps) of the specified dependencies
   */
  protected _mergeDependencyVersions = function (
    arr1: Dependency[],
    arr2: Dependency[],
  ): Dependency[] {
    if (Array.isArray(arr2) && arr2.length > 0) {
      //arr2.filter(e2 => arr1.findIndex(e1 => e1.key == e2.key))

      arr2.forEach(e2 => {
        let index = arr1.findIndex(e1 => {
          return e1.key == e2.key;
        });

        if (index != -1) {
          arr1[index] = e2;
        } else {
          arr1.push(e2);
        }
      });
    }
    return arr1;
  };

  /**
   * Check whether the dependencies have changed.
   * @param {mixed} cachedData The data pulled from the cache
   * @returns {bool} Returns TRUE if the dependency is valid (not changed), FALSE otherwise
   */
  protected async _validateDependencyVersions(
    cachedData: unknown,
  ): Promise<boolean> {
    let isValid = false;
    if (
      cachedData !== null &&
      Array.isArray(cachedData) &&
      cachedData.length === 2
    ) {
      //cachedData is valid because there is no dependency
      if (
        cachedData[1] === null ||
        (Array.isArray(cachedData[1]) && cachedData[1].length == 0)
      ) {
        return true;
      }
      //verify dependency by checking if dependency versions have been changed?
      else {
        const dependencyKeys = cachedData[1].map(e => e.key);
        const dependencies: Dependency[] = await this._getDependencyVersions(
          dependencyKeys,
        );
        if (isEqual(dependencies, cachedData[1])) {
          isValid = true;
        }
      }
    }
    return isValid;
  }

  /**
   * Builds a normalized cache key from a give key
   *
   * @param {string} key the key to be normalized
   * @param {string} prefix the string that append at begining of key
   * @return {string} the generated cache key
   */
  protected _buildCacheKey(key: string, prefix: string): string {
    //TODO: KEY SHOULD BE HASHED BY MD5
    return prefix + key;
  }

  /**
   * Builds a normalized Key for DATA
   * @param key
   */
  protected _buildDataCacheKey(key: string): string {
    return this._buildCacheKey(key, 'D_');
  }

  /**
   * Builds a normalized Key for Dependency
   * @param key
   */
  protected _buildDependencyCacheKey(key: string): string {
    return this._buildCacheKey(key, 'T_');
  }
}

export type Dependency = {
  key: string;
  version: string;
};
