import { CACHE_MANAGER, Inject, Injectable } from '@nestjs/common';
import { MultiCache } from 'cache-manager';
import * as isEqual from 'lodash.isequal';

@Injectable()
export class CacheDependencyService {
  constructor(
    @Inject(CACHE_MANAGER)
    private cacheManager: MultiCache,
  ) {}

  /**
   * Set cache with dependency keys
   * @param key
   * @param value
   * @param ttl
   * @param dependencyKeys
   */
  async set(key: string, value, ttl: number, dependencyKeys: string[]) {
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
      ttl,
    );
  }

  /**
   * Get cached data
   * @param key
   */
  public async get(key): Promise<any> {
    const cacheKey = this._buildDataCacheKey(key);
    const cachedData = await this.cacheManager.get<string>(cacheKey);

    if (cachedData !== undefined) {
      const data = JSON.parse(cachedData);
      const isValid = await this._validateDependencyVersions(data);
      if (isValid) {
        return data[0];
      }
    }
    return null;
  }

  /**
   * Invalidates all of the cached data items that are associated with any of the specified dependencies.
   * @param {(string|array)} dependencyKeys
   * @return {boolean} TRUE on success, FALSE otherwise.
   */
  public async invalidate(dependencyKeys: string | Array<string>) {
    if (dependencyKeys) {
      if (!Array.isArray(dependencyKeys)) {
        dependencyKeys = [dependencyKeys];
      }
      dependencyKeys = dependencyKeys.map(e => {
        return this._buildDependencyCacheKey(e);
      });
      //touch to change dependency versions
      return await this._updateDependencyVersions(dependencyKeys);
    }
    return false;
  }

  /**
   * Generate dependency versions (timestamps) for the specified dependencies.
   * This function will try to pull the dependency's versions from cache first.
   * Then force to generate version of unavailable dependencies by calling {this._updateDependencyVersions}
   *
   * @param {object} client Redis cache client connection
   * @param {array} dependencies List of specified dependencies
   * @return {array} the versions (timestamps) of the specified dependencies
   */
  protected async _generateDependencyVersions(
    dependencies,
  ): Promise<Array<any>> {
    //Find all current dependencies
    let currentDependencies: Dependency[] = await this._getDependencyVersions(
      dependencies,
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
      currentDependencies = await this._mergeDependencyVersions(
        currentDependencies,
        newDependencies,
      );
    }
    return currentDependencies;
  }

  /**
   * Returns the versions (timestamps) for the specified dependency dependencies
   * @param dependencyKeys List of dependency keys
   * @return {array} the versions (timestamps) of the specified dependencies
   */
  protected async _getDependencyVersions(
    dependencyKeys: Array<string>,
  ): Promise<Array<any>> {
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
   * @param dependencyKeys List of dependency keys
   * @returns {array} the version (timestamp) of the specified dependencies
   */
  protected async _updateDependencyVersions(dependencyKeys: string[]) {
    const itemObjects = [];
    const version = String(Date.now());

    if (Array.isArray(dependencyKeys) && dependencyKeys.length > 0) {
      for (let i = 0; i < dependencyKeys.length; i++) {
        await this.cacheManager.set(dependencyKeys[i], version);
        itemObjects.push({ key: dependencyKeys[i], version: version });
      }
    }
    return itemObjects;
  }

  /**
   * Merge new list of dependency versions to the current.
   * @param {array} arr1 array of current dependency versions
   * @param {array} arr2 new list of dependency versions need to be merged
   * @return {array} the list of versions (timestamps) of the specified dependencies
   */
  protected _mergeDependencyVersions = function (arr1, arr2) {
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
  protected async _validateDependencyVersions(cachedData): Promise<boolean> {
    let isValid = false;
    if (
      cachedData !== null &&
      Array.isArray(cachedData) &&
      cachedData.length == 2
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
  protected _buildCacheKey = function (key: string, prefix: string): string {
    //TODO: KEY SHOULD BE HASHED BY MD5
    return String(prefix) + String(key);
  };

  /**
   * Builds a normalized Key for DATA
   * @param key
   */
  protected _buildDataCacheKey = function (key) {
    return this._buildCacheKey(key, 'D_');
  };

  /**
   * Builds a normalized Key for Dependency
   * @param key
   */
  protected _buildDependencyCacheKey = function (key) {
    return this._buildCacheKey(key, 'T_');
  };
}

export type Dependency = {
  key: string;
  version: string;
};
