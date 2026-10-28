/**
 * Values made once per key and scene. Each scene has its own entries, so a recreated scene gets fresh values and
 * never one that belongs to a disposed scene; a dropped scene's entries go with it. Free of Babylon: any object
 * can be the scene.
 */
export class SceneCache<S extends object, V> {
  private byScene = new WeakMap<S, Map<string, V>>();

  /** The value for `key` in `scene`, made with `make` the first time it is asked for. */
  get(scene: S, key: string, make: () => V): V {
    let values = this.byScene.get(scene);
    if (!values) { values = new Map(); this.byScene.set(scene, values); }
    let value = values.get(key);
    if (value === undefined) { value = make(); values.set(key, value); }
    return value;
  }
}
