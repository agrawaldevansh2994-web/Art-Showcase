// Streams zones in and out around the player.
//
// A zone is: a centre, a radius, and a generate() that returns a Group whose
// userData.update(ctx) drives its animation. Anything a zone registers with the
// collision system must be labelled with the zone key so unloading can take it back out.

import * as THREE from 'three';
import { ZONE_ACTIVATE_DIST, ZONE_DEACTIVATE_DIST } from './constants.js';

/**
 * Anything the Props library hands out is flagged `userData.shared` — it is on loan,
 * not owned by the zone, and several zones hold the same instance at once. Disposing
 * MAT.wood because Chai Bazaar streamed out forces a re-upload and a shader recompile
 * the next moment any other zone draws with it, which is a visible hitch.
 */
function disposeResource(res) {
    if (!res || res.userData?.shared) return;
    res.dispose();
}

/**
 * Materials own textures, and nothing used to dispose those — so every trip in and out
 * of a zone leaked its textures onto the GPU until the driver started thrashing.
 * Shared textures (cached glow sprites, signs) are skipped for the reason above.
 */
function disposeMaterial(mat) {
    if (!mat || mat.userData?.shared) return;
    for (const value of Object.values(mat)) {
        if (value && value.isTexture) disposeResource(value);
    }
    mat.dispose();
}

export function createZoneManager(scene, zones, collisionSystem, ui, renderer, camera) {
    const _p = new THREE.Vector2();
    let currentLabel = '';
    let frozen = false;      // set by preloadAll — stops any further load/unload

    /**
     * Building a zone is cheap (~10-30 ms). *showing* it is not: the first
     * composer.render() that sees new materials makes the driver compile and link every
     * shader they need, on the main thread, mid-frame. Measured at 200-500 ms freezes as
     * each zone came into range — the single worst thing about moving through the valley.
     *
     * compileAsync warms those programs through KHR_parallel_shader_compile and only then
     * puts the zone in the scene, so the cost lands on driver threads instead of a frame.
     * Zones activate ~210 units out, so the extra frames spent warming are invisible.
     */
    function load(key, zone, ctx) {
        const group = zone.generate(ctx);
        group.name = key;
        zone.group = group;
        zone.loaded = true;              // claimed immediately so stream() cannot re-enter
        if (zone.onLoad) zone.onLoad(ctx);

        scene.add(group);
    }

    function unload(key, zone, ctx) {
        if (zone.group.userData.onUnload) zone.group.userData.onUnload(ctx);
        if (zone.onUnload) zone.onUnload(ctx);
        // Zones tag their interactables and obstacles with the zone key, so both
        // registries can be cleaned out without the zone having to track them.
        ctx.controls.removeInteractablesByOwner(key);
        scene.remove(zone.group);
        zone.group.traverse(child => {
            if (child.geometry) disposeResource(child.geometry);
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
                else disposeMaterial(child.material);
            }
        });
        collisionSystem.unregisterByLabel(key);
        zone.group = null;
        zone.loaded = false;
    }

    /**
     * Proximity check — cheap, but no reason to run it every frame.
     *
     * Streaming is disabled once preloadAll() has run. Loading a zone brings its
     * PointLights with it, and three.js bakes the scene's light count into every
     * material's shader — so a single zone activating recompiles *every shader in the
     * scene*, on the main thread, mid-frame. Measured: adding one bare PointLight took
     * the program count from 36 to 49. That was the 200-500 ms freeze at zone
     * boundaries. Everything is loaded and compiled up front instead, behind the entry
     * overlay, so the light count never changes again once you are walking.
     */
    function stream(camera, ctx) {
        _p.set(camera.position.x, camera.position.z);

        if (!frozen) {
            for (const key in zones) {
                const zone = zones[key];
                const d = _p.distanceTo(new THREE.Vector2(zone.center.x, zone.center.z));
                const activate = zone.activateDist ?? ZONE_ACTIVATE_DIST;
                const deactivate = zone.deactivateDist ?? ZONE_DEACTIVATE_DIST;

                if (!zone.loaded && (zone.alwaysLoaded || d < activate)) load(key, zone, ctx);
                else if (zone.loaded && !zone.alwaysLoaded && d > deactivate) unload(key, zone, ctx);
            }
        }

        // Name the place you are standing in.
        let inside = null, bestD = Infinity;
        for (const key in zones) {
            const z = zones[key];
            const d = _p.distanceTo(new THREE.Vector2(z.center.x, z.center.z));
            if (d < z.radius && d < bestD) { bestD = d; inside = z; }
        }
        const label = inside ? inside.name : '';
        if (label !== currentLabel) {
            currentLabel = label;
            ui.zoneLabel(label);
        }
    }

    function animate(ctx) {
        for (const key in zones) {
            const zone = zones[key];
            if (!zone.loaded || !zone.group) continue;
            const u = zone.group.userData.update;
            if (typeof u === 'function') u(ctx);
        }
    }

    function loadAll(ctx) {
        for (const key in zones) {
            if (!zones[key].loaded) load(key, zones[key], ctx);
        }
    }

    /**
     * Build every zone, then compile every shader while the entry overlay is still up.
     * After this the scene's light count and program set are fixed, so nothing recompiles
     * mid-walk. Returns the time it cost, which is worth keeping an eye on.
     */
    function preloadAll(ctx) {
        const t0 = performance.now();
        loadAll(ctx);
        const built = performance.now();
        if (renderer) {
            scene.updateMatrixWorld(true);
            renderer.compile(scene, camera);
            // compile() only kicks off linking when KHR_parallel_shader_compile is
            // present; one real render forces the driver to finish before play starts.
            renderer.render(scene, camera);
        }
        frozen = true;
        return { buildMs: Math.round(built - t0), compileMs: Math.round(performance.now() - built) };
    }

    return {
        stream, animate, loadAll, preloadAll,
        getCurrentZoneName: () => currentLabel,
    };
}
