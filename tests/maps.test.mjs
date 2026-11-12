import test from 'node:test';
import assert from 'node:assert/strict';
import {
  destinationFitsMap,
  layoutDestinationMarkers,
  projectDestination,
  renderAdventureMap,
  unprojectMapPoint,
} from '../src/lib/maps.js';
import { DESTINATIONS } from '../src/lib/model.js';

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should match ${expected}`);
const place = (id, lat, lon, region = 'us') => ({id, name: id, lat, lon, region, emoji: '🏖️', cost: 30});
const assertSeparated = markers => {
  for (let i = 0; i < markers.length; i++) {
    for (let j = i + 1; j < markers.length; j++) {
      const a = markers[i].box, b = markers[j].box;
      const width = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const height = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      assert.ok(width <= 0 || height <= 0, `${markers[i].destination.id} overlaps ${markers[j].destination.id}`);
    }
  }
};

test('US Albers projection round-trips real cities and its geographic bounds', () => {
  const coordinates = [
    [27.50, -82.71], // Holmes Beach
    [47.61, -122.33], // Seattle
    [40.71, -74.01], // New York
    [24, -125], [24, -66], [50, -125], [50, -66],
  ];
  for (const [lat, lon] of coordinates) {
    const result = unprojectMapPoint(...projectDestination({lat, lon}), 'us');
    assert.ok(result);
    closeTo(result.lat, lat);
    closeTo(result.lon, lon);
  }
});

test('world projection round-trips Turks and Caicos, Sydney, poles, and the date line', () => {
  for (const [lat, lon] of [[21.79, -72.27], [-33.87, 151.21], [90, 0], [-90, 0], [0, -180], [0, 180], [90, -180], [-90, 180]]) {
    const result = unprojectMapPoint(...projectDestination({lat, lon}, 'world'), 'world');
    assert.ok(result);
    closeTo(result.lat, lat);
    closeTo(result.lon, lon);
  }
});

test('map picking rejects invalid points, ocean outside the US extent, and unknown maps', () => {
  for (const [x, y, region] of [
    [-1, 270, 'us'], [1001, 270, 'world'], [500, -1, 'world'], [500, 541, 'world'],
    [0, 0, 'us'], [44, 270, 'world'], [956, 270, 'world'], [500, 0, 'world'],
    [NaN, 200, 'us'], [Infinity, 200, 'us'], [null, 200, 'us'], ['', 200, 'us'],
    [true, 200, 'us'], [500, 270, 'unknown'],
  ]) assert.equal(unprojectMapPoint(x, y, region), null);
});

test('destination validation matches the contiguous US and full world geographic bounds', () => {
  assert.equal(destinationFitsMap({lat: 27.5, lon: -82.71}), true);
  assert.equal(destinationFitsMap({latitude: '47.61', longitude: '-122.33'}), true);
  assert.equal(destinationFitsMap({lat: 21.79, lon: -72.27}), false);
  assert.equal(destinationFitsMap({lat: 21.79, lon: -72.27}, 'world'), true);
  assert.equal(destinationFitsMap({lat: 64.2, lon: -149.5}), false); // Alaska uses world map.
  assert.equal(destinationFitsMap({lat: 64.2, lon: -149.5}, 'world'), true);
  for (const invalid of [null, {}, {lat: '', lon: 0}, {lat: null, lon: 0}, {lat: true, lon: 0}, {lat: 91, lon: 0}, {lat: 0, lon: -181}]) {
    assert.equal(destinationFitsMap(invalid, 'world'), false);
  }
});

test('world map includes family US places while US map excludes world destinations', () => {
  const destinations = [place('holmes-beach', 27.5, -82.71), place('turks-caicos', 21.79, -72.27, 'world')];
  const world = renderAdventureMap({region: 'world', destinations});
  assert.match(world, /data-destination="holmes-beach"/);
  assert.match(world, /data-destination="turks-caicos"/);
  const us = renderAdventureMap({region: 'us', destinations});
  assert.match(us, /data-destination="holmes-beach"/);
  assert.doesNotMatch(us, /data-destination="turks-caicos"/);
});

test('selection renders at exact map coordinates and ignores invalid selections', () => {
  const selection = {lat: 27.5, lon: -82.71};
  const [x, y] = projectDestination(selection);
  const svg = renderAdventureMap({selection});
  assert.match(svg, /data-map-selection="true"/);
  assert.ok(svg.includes(`transform="translate(${x} ${y})"`));
  assert.match(svg, /Your place/);
  assert.doesNotMatch(renderAdventureMap({selection: {lat: 0, lon: 0}}), /data-map-selection="true"/);
});

test('nearby Florida destinations get separate callouts with real-location leaders', () => {
  const destinations = [place('orlando', 28.54, -81.38), place('holmes-beach', 27.5, -82.71), place('family-beach', 27.51, -82.72)];
  const layout = layoutDestinationMarkers(destinations);
  assertSeparated(layout);
  for (const marker of layout) assert.deepEqual(marker.point, projectDestination(marker.destination));
  assert.deepEqual(layout, layoutDestinationMarkers(destinations)); // Stable between re-renders.
  const svg = renderAdventureMap({destinations});
  assert.match(svg, /stroke="#65916c"/);
  assert.match(svg, /r="4.2"/);
});

test('default adventures stay separate on both maps, with compact US pins on world', () => {
  assertSeparated(layoutDestinationMarkers(DESTINATIONS, 'us'));
  const world = layoutDestinationMarkers(DESTINATIONS, 'world');
  assertSeparated(world);
  assert.equal(world.length, DESTINATIONS.length);
  assert.ok(world.some(marker => marker.destination.region === 'us' && marker.compact));
  assert.ok(world.filter(marker => marker.destination.region === 'world').every(marker => !marker.compact));
});

test('custom labels are escaped and a full family collection remains renderable', () => {
  const destinations = Array.from({length: 100}, (_, index) => place(`place-${index}`, 25 + (index % 24), -124 + (index % 58)));
  destinations[0].name = '<script>bad</script>';
  const svg = renderAdventureMap({region: 'world', destinations});
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.equal((svg.match(/data-destination=/g) || []).length, 100);
});
