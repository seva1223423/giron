#!/usr/bin/env node
/**
 * Generate exercise-animations.json for every exercise in src/data/exercises.ts
 * using a library of motion-pattern templates.
 *
 * How it works:
 *   1. Parse exercise IDs from src/data/exercises.ts.
 *   2. Classify each ID by keyword heuristics → picks a pattern template.
 *   3. Writes out full keyframe structure for each exercise (same JSON format
 *      that render_exercise.py / render_exercise_mixamo.py consume).
 *
 * Run:
 *   node scripts/blender/generate-animations.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXERCISES_FILE = path.join(REPO_ROOT, 'src', 'data', 'exercises.ts');
const OUT_FILE = path.join(__dirname, 'exercise-animations.json');

const src = fs.readFileSync(EXERCISES_FILE, 'utf8');
const ids = Array.from(src.matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)).map((m) => m[1]);
console.log(`Found ${ids.length} exercise IDs`);

// ────────────────────────────────────────────────────────────────────────────
// Motion templates
// Each template returns a { duration, keyframes[] } structure representing
// 2 reps of the movement (6 keyframes: start → down → up → down → up → start).
// All angles in degrees, locations in meters (figure is ~1.75 m tall, hips at
// rest z ≈ 1.0 m).
// ────────────────────────────────────────────────────────────────────────────

// Helpers to build symmetric two-rep patterns from a "rest" and "peak" pose.
function twoReps(restPose, peakPose, { duration = 3.0 } = {}) {
  return {
    duration,
    keyframes: [
      { t: 0.0, parts: restPose },
      { t: duration * 0.25, parts: peakPose },
      { t: duration * 0.5, parts: restPose },
      { t: duration * 0.75, parts: peakPose },
      { t: duration, parts: restPose },
    ],
  };
}

const PATTERNS = {
  // Squat / leg press / goblet — hips drop, knees bend, torso leans slightly.
  squat: () => twoReps(
    { Root: {loc_z: 0}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: -10}, UpperArm_L: {rot_x: -10} },
    { Root: {loc_z: -0.30}, Torso: {rot_x: 22}, Thigh_R: {rot_x: 75}, Thigh_L: {rot_x: 75}, Shin_R: {rot_x: -78}, Shin_L: {rot_x: -78}, UpperArm_R: {rot_x: 85}, UpperArm_L: {rot_x: 85} },
  ),

  // Front squat — bar on shoulders, upright torso.
  front_squat: () => twoReps(
    { Root: {loc_z: 0}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 105}, UpperArm_L: {rot_x: 105}, Forearm_R: {rot_x: 90}, Forearm_L: {rot_x: 90} },
    { Root: {loc_z: -0.32}, Torso: {rot_x: 10}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -85}, Shin_L: {rot_x: -85}, UpperArm_R: {rot_x: 105}, UpperArm_L: {rot_x: 105}, Forearm_R: {rot_x: 90}, Forearm_L: {rot_x: 90} },
  ),

  // Deadlift / RDL / good-morning — hip hinge, torso forward, arms hang.
  deadlift: () => twoReps(
    { Root: {loc_z: 0}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 0}, UpperArm_L: {rot_x: 0} },
    { Root: {loc_z: -0.15}, Torso: {rot_x: 70}, Thigh_R: {rot_x: 30}, Thigh_L: {rot_x: 30}, Shin_R: {rot_x: -15}, Shin_L: {rot_x: -15}, UpperArm_R: {rot_x: 15}, UpperArm_L: {rot_x: 15} },
  ),

  // Romanian / stiff-leg — straighter legs, deeper bend.
  romanian_deadlift: () => twoReps(
    { Root: {loc_z: 0}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, UpperArm_R: {rot_x: 0}, UpperArm_L: {rot_x: 0} },
    { Root: {loc_z: -0.08}, Torso: {rot_x: 85}, Thigh_R: {rot_x: 15}, Thigh_L: {rot_x: 15}, UpperArm_R: {rot_x: 15}, UpperArm_L: {rot_x: 15} },
  ),

  // Bench-press — figure lies on back (approx: root low, torso tilted back 80°),
  // arms press upward. We translate the whole figure using Root rotation not
  // directly supported, so we fake it with torso lean.
  bench_press: () => twoReps(
    { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 90}, Thigh_L: {rot_x: 90}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: -90, rot_y: 30}, UpperArm_L: {rot_x: -90, rot_y: -30}, Forearm_R: {rot_x: 0}, Forearm_L: {rot_x: 0} },
    { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 90}, Thigh_L: {rot_x: 90}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: -90, rot_y: 50}, UpperArm_L: {rot_x: -90, rot_y: -50}, Forearm_R: {rot_x: 85}, Forearm_L: {rot_x: 85} },
  ),

  incline_bench_press: () => twoReps(
    { Root: {loc_z: -0.35, loc_y: 0.05}, Torso: {rot_x: -45}, Thigh_R: {rot_x: 55}, Thigh_L: {rot_x: 55}, Shin_R: {rot_x: -30}, Shin_L: {rot_x: -30}, UpperArm_R: {rot_x: -60, rot_y: 25}, UpperArm_L: {rot_x: -60, rot_y: -25} },
    { Root: {loc_z: -0.35, loc_y: 0.05}, Torso: {rot_x: -45}, Thigh_R: {rot_x: 55}, Thigh_L: {rot_x: 55}, Shin_R: {rot_x: -30}, Shin_L: {rot_x: -30}, UpperArm_R: {rot_x: -60, rot_y: 50}, UpperArm_L: {rot_x: -60, rot_y: -50}, Forearm_R: {rot_x: 85}, Forearm_L: {rot_x: 85} },
  ),

  decline_bench_press: () => twoReps(
    { Root: {loc_z: -0.55, loc_y: 0.15}, Torso: {rot_x: -95}, Thigh_R: {rot_x: 105}, Thigh_L: {rot_x: 105}, Shin_R: {rot_x: -90}, Shin_L: {rot_x: -90}, UpperArm_R: {rot_x: -90, rot_y: 30}, UpperArm_L: {rot_x: -90, rot_y: -30} },
    { Root: {loc_z: -0.55, loc_y: 0.15}, Torso: {rot_x: -95}, Thigh_R: {rot_x: 105}, Thigh_L: {rot_x: 105}, Shin_R: {rot_x: -90}, Shin_L: {rot_x: -90}, UpperArm_R: {rot_x: -90, rot_y: 45}, UpperArm_L: {rot_x: -90, rot_y: -45}, Forearm_R: {rot_x: 80}, Forearm_L: {rot_x: 80} },
  ),

  // Dumbbell fly / pec deck — lying; arms wide, then come together.
  fly: () => twoReps(
    { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 90}, Thigh_L: {rot_x: 90}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: -90, rot_y: 75}, UpperArm_L: {rot_x: -90, rot_y: -75} },
    { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 90}, Thigh_L: {rot_x: 90}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: -90, rot_y: 10}, UpperArm_L: {rot_x: -90, rot_y: -10} },
  ),

  // Overhead press / shoulder press / arnold press — arms pushing up.
  overhead_press: () => twoReps(
    { Root: {loc_z: 0}, UpperArm_R: {rot_x: 90, rot_y: 25}, UpperArm_L: {rot_x: 90, rot_y: -25}, Forearm_R: {rot_x: 85}, Forearm_L: {rot_x: 85} },
    { Root: {loc_z: 0}, UpperArm_R: {rot_x: 170, rot_y: 15}, UpperArm_L: {rot_x: 170, rot_y: -15}, Forearm_R: {rot_x: 5}, Forearm_L: {rot_x: 5} },
  ),

  // Biceps curl — standing, elbows bend while upper arm stays along torso.
  curl: () => twoReps(
    { UpperArm_R: {rot_x: 5}, UpperArm_L: {rot_x: 5}, Forearm_R: {rot_x: 0}, Forearm_L: {rot_x: 0} },
    { UpperArm_R: {rot_x: 10}, UpperArm_L: {rot_x: 10}, Forearm_R: {rot_x: 130}, Forearm_L: {rot_x: 130} },
  ),

  // Preacher / concentration curl — single arm emphasis, bench-leaning lean.
  preacher_curl: () => twoReps(
    { Torso: {rot_x: 15}, UpperArm_R: {rot_x: 50}, UpperArm_L: {rot_x: 50}, Forearm_R: {rot_x: 10}, Forearm_L: {rot_x: 10} },
    { Torso: {rot_x: 15}, UpperArm_R: {rot_x: 50}, UpperArm_L: {rot_x: 50}, Forearm_R: {rot_x: 130}, Forearm_L: {rot_x: 130} },
  ),

  // Tricep pushdown — upper arm vertical-down, forearm extends.
  tricep_pushdown: () => twoReps(
    { UpperArm_R: {rot_x: 5, rot_y: 10}, UpperArm_L: {rot_x: 5, rot_y: -10}, Forearm_R: {rot_x: 120}, Forearm_L: {rot_x: 120} },
    { UpperArm_R: {rot_x: 5, rot_y: 10}, UpperArm_L: {rot_x: 5, rot_y: -10}, Forearm_R: {rot_x: 10}, Forearm_L: {rot_x: 10} },
  ),

  // Overhead tricep / french press / skull crushers — arms up, elbows bend behind head.
  overhead_tricep: () => twoReps(
    { UpperArm_R: {rot_x: 170, rot_y: 10}, UpperArm_L: {rot_x: 170, rot_y: -10}, Forearm_R: {rot_x: 0}, Forearm_L: {rot_x: 0} },
    { UpperArm_R: {rot_x: 170, rot_y: 10}, UpperArm_L: {rot_x: 170, rot_y: -10}, Forearm_R: {rot_x: 130}, Forearm_L: {rot_x: 130} },
  ),

  // Row (bent over / cable / t-bar / dumbbell row) — hinge forward, arms pull to hips.
  row: () => twoReps(
    { Root: {loc_z: -0.1}, Torso: {rot_x: 55}, Thigh_R: {rot_x: 15}, Thigh_L: {rot_x: 15}, UpperArm_R: {rot_x: 0}, UpperArm_L: {rot_x: 0}, Forearm_R: {rot_x: 30}, Forearm_L: {rot_x: 30} },
    { Root: {loc_z: -0.1}, Torso: {rot_x: 55}, Thigh_R: {rot_x: 15}, Thigh_L: {rot_x: 15}, UpperArm_R: {rot_x: -30}, UpperArm_L: {rot_x: -30}, Forearm_R: {rot_x: 130}, Forearm_L: {rot_x: 130} },
  ),

  // Seated row — sitting upright, pull handle to torso.
  seated_row: () => twoReps(
    { Root: {loc_z: -0.35}, Torso: {rot_x: 10}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -60}, UpperArm_R: {rot_x: 20}, UpperArm_L: {rot_x: 20}, Forearm_R: {rot_x: 15}, Forearm_L: {rot_x: 15} },
    { Root: {loc_z: -0.35}, Torso: {rot_x: -5}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -60}, UpperArm_R: {rot_x: -10}, UpperArm_L: {rot_x: -10}, Forearm_R: {rot_x: 135}, Forearm_L: {rot_x: 135} },
  ),

  // Lat pulldown — sitting upright, arms above pulling down to chest.
  lat_pulldown: () => twoReps(
    { Root: {loc_z: -0.35}, Torso: {rot_x: -5}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -60}, UpperArm_R: {rot_x: 160, rot_y: 35}, UpperArm_L: {rot_x: 160, rot_y: -35} },
    { Root: {loc_z: -0.35}, Torso: {rot_x: -5}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -60}, UpperArm_R: {rot_x: 60, rot_y: 40}, UpperArm_L: {rot_x: 60, rot_y: -40}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 60} },
  ),

  // Pull-up / chin-up — hanging, then up.
  pull_up: () => twoReps(
    { Root: {loc_z: 0.25}, UpperArm_R: {rot_x: 170, rot_y: 25}, UpperArm_L: {rot_x: 170, rot_y: -25}, Forearm_R: {rot_x: 0}, Forearm_L: {rot_x: 0}, Thigh_R: {rot_x: 10}, Thigh_L: {rot_x: 10}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25} },
    { Root: {loc_z: 0.55}, UpperArm_R: {rot_x: 170, rot_y: 25}, UpperArm_L: {rot_x: 170, rot_y: -25}, Forearm_R: {rot_x: 130}, Forearm_L: {rot_x: 130}, Thigh_R: {rot_x: 10}, Thigh_L: {rot_x: 10}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25} },
  ),

  // Push-up — prone, arms bend.
  push_up: () => twoReps(
    { Root: {loc_z: -0.6, loc_y: 0.3}, Torso: {rot_x: 80}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -80}, UpperArm_R: {rot_x: 180, rot_y: 15}, UpperArm_L: {rot_x: 180, rot_y: -15}, Forearm_R: {rot_x: 0}, Forearm_L: {rot_x: 0} },
    { Root: {loc_z: -0.78, loc_y: 0.3}, Torso: {rot_x: 80}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -80}, UpperArm_R: {rot_x: 180, rot_y: 15}, UpperArm_L: {rot_x: 180, rot_y: -15}, Forearm_R: {rot_x: 85}, Forearm_L: {rot_x: 85} },
  ),

  // Dips — arms straight, then bend elbows.
  dip: () => twoReps(
    { Root: {loc_z: 0.15}, Thigh_R: {rot_x: 40}, Thigh_L: {rot_x: 40}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25}, UpperArm_R: {rot_x: 170, rot_y: 15}, UpperArm_L: {rot_x: 170, rot_y: -15}, Forearm_R: {rot_x: 5}, Forearm_L: {rot_x: 5} },
    { Root: {loc_z: -0.05}, Thigh_R: {rot_x: 40}, Thigh_L: {rot_x: 40}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25}, UpperArm_R: {rot_x: 170, rot_y: 15}, UpperArm_L: {rot_x: 170, rot_y: -15}, Forearm_R: {rot_x: 95}, Forearm_L: {rot_x: 95} },
  ),

  // Lateral raise — arms lift sideways.
  lateral_raise: () => twoReps(
    { UpperArm_R: {rot_x: 5, rot_y: 5}, UpperArm_L: {rot_x: 5, rot_y: -5} },
    { UpperArm_R: {rot_x: 5, rot_y: 80}, UpperArm_L: {rot_x: 5, rot_y: -80} },
  ),

  // Front raise.
  front_raise: () => twoReps(
    { UpperArm_R: {rot_x: 0}, UpperArm_L: {rot_x: 0} },
    { UpperArm_R: {rot_x: 90}, UpperArm_L: {rot_x: 90} },
  ),

  // Reverse fly / rear delt — bent over, arms out to sides.
  reverse_fly: () => twoReps(
    { Root: {loc_z: -0.1}, Torso: {rot_x: 65}, Thigh_R: {rot_x: 15}, Thigh_L: {rot_x: 15}, UpperArm_R: {rot_x: -90, rot_y: 10}, UpperArm_L: {rot_x: -90, rot_y: -10} },
    { Root: {loc_z: -0.1}, Torso: {rot_x: 65}, Thigh_R: {rot_x: 15}, Thigh_L: {rot_x: 15}, UpperArm_R: {rot_x: -90, rot_y: 80}, UpperArm_L: {rot_x: -90, rot_y: -80} },
  ),

  // Upright row / face pull — elbows lift up to shoulder height.
  upright_row: () => twoReps(
    { UpperArm_R: {rot_x: 5, rot_y: 10}, UpperArm_L: {rot_x: 5, rot_y: -10}, Forearm_R: {rot_x: 15}, Forearm_L: {rot_x: 15} },
    { UpperArm_R: {rot_x: 5, rot_y: 85}, UpperArm_L: {rot_x: 5, rot_y: -85}, Forearm_R: {rot_x: 90}, Forearm_L: {rot_x: 90} },
  ),

  // Shrugs — shoulders lift (we approximate with Torso slight push up via Root).
  shrugs: () => twoReps(
    { Root: {loc_z: 0}, UpperArm_R: {rot_x: 0}, UpperArm_L: {rot_x: 0} },
    { Root: {loc_z: 0.05}, UpperArm_R: {rot_x: -10}, UpperArm_L: {rot_x: -10} },
  ),

  // Plank — mostly static, slight breathing motion.
  plank: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Torso: {rot_x: 80}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -80}, UpperArm_R: {rot_x: 180, rot_y: 15}, UpperArm_L: {rot_x: 180, rot_y: -15}, Forearm_R: {rot_x: 85}, Forearm_L: {rot_x: 85} }},
      { t: 1.5, parts: { Root: {loc_z: -0.76, loc_y: 0.3}, Torso: {rot_x: 80}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -80}, UpperArm_R: {rot_x: 180, rot_y: 15}, UpperArm_L: {rot_x: 180, rot_y: -15}, Forearm_R: {rot_x: 85}, Forearm_L: {rot_x: 85} }},
      { t: 3.0, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Torso: {rot_x: 80}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -80}, UpperArm_R: {rot_x: 180, rot_y: 15}, UpperArm_L: {rot_x: 180, rot_y: -15}, Forearm_R: {rot_x: 85}, Forearm_L: {rot_x: 85} }},
    ],
  }),

  // Crunch / cable crunch / decline crunch / reverse crunch — supine, torso curls up.
  crunch: () => twoReps(
    { Root: {loc_z: -0.65, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -85}, Shin_L: {rot_x: -85}, UpperArm_R: {rot_x: 170, rot_y: 20}, UpperArm_L: {rot_x: 170, rot_y: -20}, Forearm_R: {rot_x: 80}, Forearm_L: {rot_x: 80} },
    { Root: {loc_z: -0.65, loc_y: 0.1}, Torso: {rot_x: -55}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -85}, Shin_L: {rot_x: -85}, UpperArm_R: {rot_x: 170, rot_y: 20}, UpperArm_L: {rot_x: 170, rot_y: -20}, Forearm_R: {rot_x: 80}, Forearm_L: {rot_x: 80} },
  ),

  // Hanging leg raise.
  hanging_leg_raise: () => twoReps(
    { Root: {loc_z: 0.35}, UpperArm_R: {rot_x: 170, rot_y: 20}, UpperArm_L: {rot_x: 170, rot_y: -20}, Thigh_R: {rot_x: 10}, Thigh_L: {rot_x: 10}, Shin_R: {rot_x: -15}, Shin_L: {rot_x: -15} },
    { Root: {loc_z: 0.35}, UpperArm_R: {rot_x: 170, rot_y: 20}, UpperArm_L: {rot_x: 170, rot_y: -20}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -60} },
  ),

  // Russian twist — sit, twist torso side to side.
  russian_twist: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -30, rot_z: 0}, Thigh_R: {rot_x: 60}, Thigh_L: {rot_x: 60}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -55}, UpperArm_R: {rot_x: 70}, UpperArm_L: {rot_x: 70}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 60} }},
      { t: 0.75, parts: { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -30, rot_z: 35}, Thigh_R: {rot_x: 60}, Thigh_L: {rot_x: 60}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -55}, UpperArm_R: {rot_x: 70}, UpperArm_L: {rot_x: 70}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 60} }},
      { t: 1.5, parts: { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -30, rot_z: -35}, Thigh_R: {rot_x: 60}, Thigh_L: {rot_x: 60}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -55}, UpperArm_R: {rot_x: 70}, UpperArm_L: {rot_x: 70}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 60} }},
      { t: 2.25, parts: { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -30, rot_z: 35}, Thigh_R: {rot_x: 60}, Thigh_L: {rot_x: 60}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -55}, UpperArm_R: {rot_x: 70}, UpperArm_L: {rot_x: 70}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 60} }},
      { t: 3.0, parts: { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -30, rot_z: 0}, Thigh_R: {rot_x: 60}, Thigh_L: {rot_x: 60}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -55}, UpperArm_R: {rot_x: 70}, UpperArm_L: {rot_x: 70}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 60} }},
    ],
  }),

  side_plank: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.6, loc_y: 0.2}, Torso: {rot_x: 70, rot_y: 45}, UpperArm_R: {rot_x: 160, rot_y: -10}, Forearm_R: {rot_x: 80}, Thigh_R: {rot_x: -75}, Thigh_L: {rot_x: -75} }},
      { t: 3.0, parts: { Root: {loc_z: -0.58, loc_y: 0.2}, Torso: {rot_x: 70, rot_y: 45}, UpperArm_R: {rot_x: 160, rot_y: -10}, Forearm_R: {rot_x: 80}, Thigh_R: {rot_x: -75}, Thigh_L: {rot_x: -75} }},
    ],
  }),

  // Lunge — one leg steps forward, back knee drops.
  lunge: () => twoReps(
    { Root: {loc_z: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0} },
    { Root: {loc_z: -0.28}, Thigh_R: {rot_x: 70}, Thigh_L: {rot_x: -35}, Shin_R: {rot_x: -90}, Shin_L: {rot_x: -70} },
  ),

  // Step-up — bring one leg up onto platform.
  step_up: () => twoReps(
    { Root: {loc_z: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0} },
    { Root: {loc_z: 0.15}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 5}, Shin_R: {rot_x: -85}, Shin_L: {rot_x: 0} },
  ),

  // Leg curl — prone, knee bends up.
  leg_curl: () => twoReps(
    { Root: {loc_z: -0.78, loc_y: -0.1}, Torso: {rot_x: 85}, Thigh_R: {rot_x: -85}, Thigh_L: {rot_x: -85}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 170}, UpperArm_L: {rot_x: 170} },
    { Root: {loc_z: -0.78, loc_y: -0.1}, Torso: {rot_x: 85}, Thigh_R: {rot_x: -85}, Thigh_L: {rot_x: -85}, Shin_R: {rot_x: 120}, Shin_L: {rot_x: 120}, UpperArm_R: {rot_x: 170}, UpperArm_L: {rot_x: 170} },
  ),

  // Leg extension — seated, knee extends.
  leg_extension: () => twoReps(
    { Root: {loc_z: -0.35}, Torso: {rot_x: 5}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: -85}, Shin_L: {rot_x: -85} },
    { Root: {loc_z: -0.35}, Torso: {rot_x: 5}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0} },
  ),

  // Calf raise — stand on toes.
  calf_raise: () => twoReps(
    { Root: {loc_z: 0} },
    { Root: {loc_z: 0.10} },
  ),

  // Seated calf raise.
  seated_calf_raise: () => twoReps(
    { Root: {loc_z: -0.35}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80} },
    { Root: {loc_z: -0.30}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: 80}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80} },
  ),

  // Hip thrust / glute bridge — supine, push hips up.
  hip_thrust: () => twoReps(
    { Root: {loc_z: -0.7, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -90}, Shin_L: {rot_x: -90} },
    { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -55}, Thigh_R: {rot_x: 55}, Thigh_L: {rot_x: 55}, Shin_R: {rot_x: -90}, Shin_L: {rot_x: -90} },
  ),

  // Hyperextension — prone (on a bench), torso rises from down to level.
  hyperextension: () => twoReps(
    { Root: {loc_z: -0.1, loc_y: 0.15}, Torso: {rot_x: 70}, Thigh_R: {rot_x: -75}, Thigh_L: {rot_x: -75}, UpperArm_R: {rot_x: 140, rot_y: 25}, UpperArm_L: {rot_x: 140, rot_y: -25} },
    { Root: {loc_z: -0.1, loc_y: 0.15}, Torso: {rot_x: 0}, Thigh_R: {rot_x: -75}, Thigh_L: {rot_x: -75}, UpperArm_R: {rot_x: 140, rot_y: 25}, UpperArm_L: {rot_x: 140, rot_y: -25} },
  ),

  // Pullover — lying, arms arc from over chest back behind head.
  pullover: () => twoReps(
    { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 90}, Thigh_L: {rot_x: 90}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: -95}, UpperArm_L: {rot_x: -95} },
    { Root: {loc_z: -0.55, loc_y: 0.1}, Torso: {rot_x: -85}, Thigh_R: {rot_x: 90}, Thigh_L: {rot_x: 90}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: -180}, UpperArm_L: {rot_x: -180} },
  ),

  // Wrist curl — elbows stable, small forearm motion (approximate via small rot).
  wrist_curl: () => twoReps(
    { UpperArm_R: {rot_x: 35}, UpperArm_L: {rot_x: 35}, Forearm_R: {rot_x: 90, rot_y: -15}, Forearm_L: {rot_x: 90, rot_y: 15} },
    { UpperArm_R: {rot_x: 35}, UpperArm_L: {rot_x: 35}, Forearm_R: {rot_x: 90, rot_y: 15}, Forearm_L: {rot_x: 90, rot_y: -15} },
  ),

  // Cardio stationary — treadmill / cycling / elliptical / rowing etc. —
  // running-in-place style alternating legs.
  cardio: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Thigh_R: {rot_x: 45}, Thigh_L: {rot_x: -15}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -20}, UpperArm_R: {rot_x: -30}, UpperArm_L: {rot_x: 30}, Forearm_R: {rot_x: 50}, Forearm_L: {rot_x: 50} }},
      { t: 0.75, parts: { Thigh_R: {rot_x: -15}, Thigh_L: {rot_x: 45}, Shin_R: {rot_x: -20}, Shin_L: {rot_x: -60}, UpperArm_R: {rot_x: 30}, UpperArm_L: {rot_x: -30}, Forearm_R: {rot_x: 50}, Forearm_L: {rot_x: 50} }},
      { t: 1.5, parts: { Thigh_R: {rot_x: 45}, Thigh_L: {rot_x: -15}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -20}, UpperArm_R: {rot_x: -30}, UpperArm_L: {rot_x: 30}, Forearm_R: {rot_x: 50}, Forearm_L: {rot_x: 50} }},
      { t: 2.25, parts: { Thigh_R: {rot_x: -15}, Thigh_L: {rot_x: 45}, Shin_R: {rot_x: -20}, Shin_L: {rot_x: -60}, UpperArm_R: {rot_x: 30}, UpperArm_L: {rot_x: -30}, Forearm_R: {rot_x: 50}, Forearm_L: {rot_x: 50} }},
      { t: 3.0, parts: { Thigh_R: {rot_x: 45}, Thigh_L: {rot_x: -15}, Shin_R: {rot_x: -60}, Shin_L: {rot_x: -20}, UpperArm_R: {rot_x: -30}, UpperArm_L: {rot_x: 30}, Forearm_R: {rot_x: 50}, Forearm_L: {rot_x: 50} }},
    ],
  }),

  // Seated cycling pose.
  cycling: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.15}, Torso: {rot_x: 35}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 40}, Shin_R: {rot_x: -40}, Shin_L: {rot_x: -90}, UpperArm_R: {rot_x: 55}, UpperArm_L: {rot_x: 55}, Forearm_R: {rot_x: 30}, Forearm_L: {rot_x: 30} }},
      { t: 1.0, parts: { Root: {loc_z: -0.15}, Torso: {rot_x: 35}, Thigh_R: {rot_x: 40}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -90}, Shin_L: {rot_x: -40}, UpperArm_R: {rot_x: 55}, UpperArm_L: {rot_x: 55}, Forearm_R: {rot_x: 30}, Forearm_L: {rot_x: 30} }},
      { t: 2.0, parts: { Root: {loc_z: -0.15}, Torso: {rot_x: 35}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 40}, Shin_R: {rot_x: -40}, Shin_L: {rot_x: -90}, UpperArm_R: {rot_x: 55}, UpperArm_L: {rot_x: 55}, Forearm_R: {rot_x: 30}, Forearm_L: {rot_x: 30} }},
      { t: 3.0, parts: { Root: {loc_z: -0.15}, Torso: {rot_x: 35}, Thigh_R: {rot_x: 40}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -90}, Shin_L: {rot_x: -40}, UpperArm_R: {rot_x: 55}, UpperArm_L: {rot_x: 55}, Forearm_R: {rot_x: 30}, Forearm_L: {rot_x: 30} }},
    ],
  }),

  // Rowing machine — seated, arms pull to torso + legs extend.
  rowing_machine: () => twoReps(
    { Root: {loc_z: -0.15}, Torso: {rot_x: 15}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -75}, Shin_L: {rot_x: -75}, UpperArm_R: {rot_x: 30}, UpperArm_L: {rot_x: 30}, Forearm_R: {rot_x: 15}, Forearm_L: {rot_x: 15} },
    { Root: {loc_z: -0.05}, Torso: {rot_x: -10}, Thigh_R: {rot_x: 10}, Thigh_L: {rot_x: 10}, Shin_R: {rot_x: -10}, Shin_L: {rot_x: -10}, UpperArm_R: {rot_x: -20}, UpperArm_L: {rot_x: -20}, Forearm_R: {rot_x: 130}, Forearm_L: {rot_x: 130} },
  ),

  // Jump rope — alternating lift.
  jump_rope: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: 0}, Thigh_R: {rot_x: 20}, Thigh_L: {rot_x: 20}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25}, UpperArm_R: {rot_x: 0, rot_y: 25}, UpperArm_L: {rot_x: 0, rot_y: -25}, Forearm_R: {rot_x: 55}, Forearm_L: {rot_x: 55} }},
      { t: 0.5, parts: { Root: {loc_z: 0.1}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 0, rot_y: 25}, UpperArm_L: {rot_x: 0, rot_y: -25}, Forearm_R: {rot_x: 55}, Forearm_L: {rot_x: 55} }},
      { t: 1.0, parts: { Root: {loc_z: 0}, Thigh_R: {rot_x: 20}, Thigh_L: {rot_x: 20}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25}, UpperArm_R: {rot_x: 0, rot_y: 25}, UpperArm_L: {rot_x: 0, rot_y: -25}, Forearm_R: {rot_x: 55}, Forearm_L: {rot_x: 55} }},
      { t: 1.5, parts: { Root: {loc_z: 0.1}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0} }},
      { t: 2.0, parts: { Root: {loc_z: 0}, Thigh_R: {rot_x: 20}, Thigh_L: {rot_x: 20}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25} }},
      { t: 2.5, parts: { Root: {loc_z: 0.1} }},
      { t: 3.0, parts: { Root: {loc_z: 0}, Thigh_R: {rot_x: 20}, Thigh_L: {rot_x: 20}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -25} }},
    ],
  }),

  // Burpee — squat → push-up → jump (simplified 4-phase).
  burpee: () => ({
    duration: 4.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: 0}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, UpperArm_R: {rot_x: 0}, UpperArm_L: {rot_x: 0} }},
      { t: 1.0, parts: { Root: {loc_z: -0.35}, Torso: {rot_x: 30}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: 85}, UpperArm_L: {rot_x: 85} }},
      { t: 2.0, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Torso: {rot_x: 80}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -80}, UpperArm_R: {rot_x: 180, rot_y: 15}, UpperArm_L: {rot_x: 180, rot_y: -15}, Forearm_R: {rot_x: 0}, Forearm_L: {rot_x: 0} }},
      { t: 3.0, parts: { Root: {loc_z: -0.35}, Torso: {rot_x: 30}, Thigh_R: {rot_x: 85}, Thigh_L: {rot_x: 85}, Shin_R: {rot_x: -80}, Shin_L: {rot_x: -80}, UpperArm_R: {rot_x: 85}, UpperArm_L: {rot_x: 85} }},
      { t: 4.0, parts: { Root: {loc_z: 0.15}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, UpperArm_R: {rot_x: 170, rot_y: 15}, UpperArm_L: {rot_x: 170, rot_y: -15} }},
    ],
  }),

  // Mountain climber — prone plank, knees drive to chest alternating.
  mountain_climber: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Torso: {rot_x: 80}, Thigh_R: {rot_x: -40}, Thigh_L: {rot_x: -80}, Shin_R: {rot_x: 80}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 180, rot_y: 15}, UpperArm_L: {rot_x: 180, rot_y: -15}, Forearm_R: {rot_x: 0}, Forearm_L: {rot_x: 0} }},
      { t: 0.75, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -40}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 80} }},
      { t: 1.5, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Thigh_R: {rot_x: -40}, Thigh_L: {rot_x: -80}, Shin_R: {rot_x: 80}, Shin_L: {rot_x: 0} }},
      { t: 2.25, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Thigh_R: {rot_x: -80}, Thigh_L: {rot_x: -40}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 80} }},
      { t: 3.0, parts: { Root: {loc_z: -0.78, loc_y: 0.3}, Thigh_R: {rot_x: -40}, Thigh_L: {rot_x: -80}, Shin_R: {rot_x: 80}, Shin_L: {rot_x: 0} }},
    ],
  }),

  // Battle ropes — standing, alternating arm waves.
  battle_ropes: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.1}, Thigh_R: {rot_x: 30}, Thigh_L: {rot_x: 30}, Shin_R: {rot_x: -40}, Shin_L: {rot_x: -40}, UpperArm_R: {rot_x: 70, rot_y: 10}, UpperArm_L: {rot_x: -20, rot_y: -10}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 40} }},
      { t: 0.75, parts: { Root: {loc_z: -0.1}, Thigh_R: {rot_x: 30}, Thigh_L: {rot_x: 30}, Shin_R: {rot_x: -40}, Shin_L: {rot_x: -40}, UpperArm_R: {rot_x: -20, rot_y: 10}, UpperArm_L: {rot_x: 70, rot_y: -10}, Forearm_R: {rot_x: 40}, Forearm_L: {rot_x: 60} }},
      { t: 1.5, parts: { UpperArm_R: {rot_x: 70, rot_y: 10}, UpperArm_L: {rot_x: -20, rot_y: -10}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 40} }},
      { t: 2.25, parts: { UpperArm_R: {rot_x: -20, rot_y: 10}, UpperArm_L: {rot_x: 70, rot_y: -10}, Forearm_R: {rot_x: 40}, Forearm_L: {rot_x: 60} }},
      { t: 3.0, parts: { UpperArm_R: {rot_x: 70, rot_y: 10}, UpperArm_L: {rot_x: -20, rot_y: -10}, Forearm_R: {rot_x: 60}, Forearm_L: {rot_x: 40} }},
    ],
  }),

  // Kettlebell swing — hip hinge then explosive upswing.
  kettlebell_swing: () => twoReps(
    { Root: {loc_z: -0.2}, Torso: {rot_x: 70}, Thigh_R: {rot_x: 30}, Thigh_L: {rot_x: 30}, Shin_R: {rot_x: -20}, Shin_L: {rot_x: -20}, UpperArm_R: {rot_x: -30}, UpperArm_L: {rot_x: -30} },
    { Root: {loc_z: 0}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, UpperArm_R: {rot_x: 90}, UpperArm_L: {rot_x: 90} },
  ),

  // Box jump — squat and jump up.
  box_jump: () => twoReps(
    { Root: {loc_z: -0.25}, Torso: {rot_x: 25}, Thigh_R: {rot_x: 70}, Thigh_L: {rot_x: 70}, Shin_R: {rot_x: -75}, Shin_L: {rot_x: -75}, UpperArm_R: {rot_x: -25}, UpperArm_L: {rot_x: -25} },
    { Root: {loc_z: 0.20}, Torso: {rot_x: 0}, Thigh_R: {rot_x: 0}, Thigh_L: {rot_x: 0}, Shin_R: {rot_x: 0}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 90}, UpperArm_L: {rot_x: 90} },
  ),

  // Farmers walk — standing upright with arms loaded, slight leg step.
  farmers_walk: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Thigh_R: {rot_x: 20}, Thigh_L: {rot_x: -10}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -10}, UpperArm_R: {rot_x: 0}, UpperArm_L: {rot_x: 0} }},
      { t: 0.75, parts: { Thigh_R: {rot_x: -10}, Thigh_L: {rot_x: 20}, Shin_R: {rot_x: -10}, Shin_L: {rot_x: -25} }},
      { t: 1.5, parts: { Thigh_R: {rot_x: 20}, Thigh_L: {rot_x: -10}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -10} }},
      { t: 2.25, parts: { Thigh_R: {rot_x: -10}, Thigh_L: {rot_x: 20}, Shin_R: {rot_x: -10}, Shin_L: {rot_x: -25} }},
      { t: 3.0, parts: { Thigh_R: {rot_x: 20}, Thigh_L: {rot_x: -10}, Shin_R: {rot_x: -25}, Shin_L: {rot_x: -10} }},
    ],
  }),

  sled_push: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.1}, Torso: {rot_x: 40}, Thigh_R: {rot_x: 45}, Thigh_L: {rot_x: -20}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -10}, UpperArm_R: {rot_x: 95}, UpperArm_L: {rot_x: 95}, Forearm_R: {rot_x: 20}, Forearm_L: {rot_x: 20} }},
      { t: 0.75, parts: { Thigh_R: {rot_x: -20}, Thigh_L: {rot_x: 45}, Shin_R: {rot_x: -10}, Shin_L: {rot_x: -55} }},
      { t: 1.5, parts: { Thigh_R: {rot_x: 45}, Thigh_L: {rot_x: -20}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -10} }},
      { t: 2.25, parts: { Thigh_R: {rot_x: -20}, Thigh_L: {rot_x: 45}, Shin_R: {rot_x: -10}, Shin_L: {rot_x: -55} }},
      { t: 3.0, parts: { Thigh_R: {rot_x: 45}, Thigh_L: {rot_x: -20}, Shin_R: {rot_x: -55}, Shin_L: {rot_x: -10} }},
    ],
  }),

  // Stretches — hold a single pose.
  pigeon_pose: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.55, loc_y: 0.2}, Torso: {rot_x: 60}, Thigh_R: {rot_x: 75, rot_z: 45}, Thigh_L: {rot_x: -60}, Shin_R: {rot_x: -30}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 60}, UpperArm_L: {rot_x: 60}, Forearm_R: {rot_x: 30}, Forearm_L: {rot_x: 30} }},
      { t: 3.0, parts: { Root: {loc_z: -0.55, loc_y: 0.2}, Torso: {rot_x: 65}, Thigh_R: {rot_x: 75, rot_z: 45}, Thigh_L: {rot_x: -60}, Shin_R: {rot_x: -30}, Shin_L: {rot_x: 0}, UpperArm_R: {rot_x: 60}, UpperArm_L: {rot_x: 60}, Forearm_R: {rot_x: 30}, Forearm_L: {rot_x: 30} }},
    ],
  }),

  thoracic_rotation: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.65, loc_y: 0.3}, Torso: {rot_x: 80, rot_z: 0}, Thigh_R: {rot_x: -70, rot_y: 20}, Thigh_L: {rot_x: -70, rot_y: -20}, UpperArm_R: {rot_x: 90, rot_y: 50}, UpperArm_L: {rot_x: 140} }},
      { t: 1.5, parts: { Root: {loc_z: -0.65, loc_y: 0.3}, Torso: {rot_x: 80, rot_z: 45}, UpperArm_R: {rot_x: 90, rot_y: -20}, UpperArm_L: {rot_x: 140} }},
      { t: 3.0, parts: { Root: {loc_z: -0.65, loc_y: 0.3}, Torso: {rot_x: 80, rot_z: 0}, UpperArm_R: {rot_x: 90, rot_y: 50}, UpperArm_L: {rot_x: 140} }},
    ],
  }),

  hip_flexor_stretch: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { Root: {loc_z: -0.2}, Torso: {rot_x: -10}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: -30}, Shin_R: {rot_x: -85}, Shin_L: {rot_x: 60}, UpperArm_R: {rot_x: 10}, UpperArm_L: {rot_x: 10} }},
      { t: 3.0, parts: { Root: {loc_z: -0.2}, Torso: {rot_x: -15}, Thigh_R: {rot_x: 80}, Thigh_L: {rot_x: -35}, Shin_R: {rot_x: -85}, Shin_L: {rot_x: 60}, UpperArm_R: {rot_x: 10}, UpperArm_L: {rot_x: 10} }},
    ],
  }),

  doorway_chest_stretch: () => ({
    duration: 3.0,
    keyframes: [
      { t: 0.0, parts: { UpperArm_R: {rot_x: 30, rot_y: 85}, UpperArm_L: {rot_x: 30, rot_y: -85}, Forearm_R: {rot_x: 80}, Forearm_L: {rot_x: 80} }},
      { t: 3.0, parts: { UpperArm_R: {rot_x: 30, rot_y: 85}, UpperArm_L: {rot_x: 30, rot_y: -85}, Forearm_R: {rot_x: 80}, Forearm_L: {rot_x: 80} }},
    ],
  }),
};

// ────────────────────────────────────────────────────────────────────────────
// Classify each exercise ID into a pattern
// ────────────────────────────────────────────────────────────────────────────
const CLASSIFIERS = [
  // Stretches and isometric holds — check first (narrow matches)
  { match: (id) => id === 'pigeon-pose',             pattern: 'pigeon_pose' },
  { match: (id) => id === 'thoracic-rotation',       pattern: 'thoracic_rotation' },
  { match: (id) => id === 'hip-flexor-stretch',      pattern: 'hip_flexor_stretch' },
  { match: (id) => id === 'doorway-chest-stretch',   pattern: 'doorway_chest_stretch' },
  { match: (id) => id === 'side-plank',              pattern: 'side_plank' },
  { match: (id) => id === 'plank',                   pattern: 'plank' },
  { match: (id) => id === 'russian-twist',           pattern: 'russian_twist' },

  // Cardio
  { match: (id) => id === 'treadmill' || id === 'elliptical',  pattern: 'cardio' },
  { match: (id) => id === 'cycling',                 pattern: 'cycling' },
  { match: (id) => id === 'rowing-machine',          pattern: 'rowing_machine' },
  { match: (id) => id === 'jump-rope',               pattern: 'jump_rope' },
  { match: (id) => id === 'burpee',                  pattern: 'burpee' },
  { match: (id) => id === 'mountain-climber',        pattern: 'mountain_climber' },
  { match: (id) => id === 'battle-ropes',            pattern: 'battle_ropes' },
  { match: (id) => id === 'kettlebell-swing',        pattern: 'kettlebell_swing' },
  { match: (id) => id === 'box-jump',                pattern: 'box_jump' },
  { match: (id) => id === 'farmers-walk',            pattern: 'farmers_walk' },
  { match: (id) => id === 'sled-push',               pattern: 'sled_push' },

  // Bench-press variants (specific)
  { match: (id) => id === 'decline-bench-press',     pattern: 'decline_bench_press' },
  { match: (id) => id === 'incline-bench-press' || id === 'incline-dumbbell-fly', pattern: 'incline_bench_press' },
  { match: (id) => id.includes('bench-press') || id === 'close-grip-bench' || id === 'chest-press-machine', pattern: 'bench_press' },

  // Fly / pec deck
  { match: (id) => id.includes('fly') || id === 'pec-deck' || id === 'cable-crossover', pattern: 'fly' },

  // Pullover
  { match: (id) => id === 'pullover',                pattern: 'pullover' },

  // Squat variants
  { match: (id) => id === 'front-squat',             pattern: 'front_squat' },
  { match: (id) => id === 'leg-press' || id === 'leg-press-wide' || id === 'hack-squat' || id === 'sumo-squat-dumbbell' || id === 'goblet-squat' || id === 'bulgarian-split-squat', pattern: 'squat' },
  { match: (id) => id === 'squat',                   pattern: 'squat' },

  // Lunges / step-ups
  { match: (id) => id === 'lunges',                  pattern: 'lunge' },
  { match: (id) => id === 'step-up',                 pattern: 'step_up' },

  // Hip thrusts / bridges
  { match: (id) => id === 'hip-thrust' || id === 'glute-bridge' || id === 'cable-glute-kickback', pattern: 'hip_thrust' },

  // Deadlift variants
  { match: (id) => id === 'romanian-deadlift' || id === 'stiff-leg-deadlift' || id === 'good-morning', pattern: 'romanian_deadlift' },
  { match: (id) => id.includes('deadlift') || id === 'rack-pull', pattern: 'deadlift' },
  { match: (id) => id === 'hyperextension' || id === 'nordic-hamstring', pattern: 'hyperextension' },

  // Leg isolations
  { match: (id) => id === 'leg-curl',                pattern: 'leg_curl' },
  { match: (id) => id === 'leg-extension',           pattern: 'leg_extension' },
  { match: (id) => id === 'standing-calf-raise' || id === 'calf-raise', pattern: 'calf_raise' },
  { match: (id) => id === 'seated-calf-raise',      pattern: 'seated_calf_raise' },

  // Rows and pulls
  { match: (id) => id === 'seated-row' || id === 'cable-row' || id === 'single-arm-cable-row', pattern: 'seated_row' },
  { match: (id) => id.includes('row') || id === 't-bar-row' || id === 'face-pull', pattern: 'row' },
  { match: (id) => id === 'upright-row',             pattern: 'upright_row' },
  { match: (id) => id === 'lat-pulldown' || id === 'reverse-grip-pulldown' || id === 'straight-arm-pulldown', pattern: 'lat_pulldown' },
  { match: (id) => id === 'pull-ups' || id === 'chin-up',     pattern: 'pull_up' },

  // Pushups / dips
  { match: (id) => id === 'push-ups' || id === 'push-up',     pattern: 'push_up' },
  { match: (id) => id === 'dips' || id === 'dips-triceps',    pattern: 'dip' },

  // Shoulder press
  { match: (id) => id === 'overhead-press' || id === 'arnold-press' || id === 'dumbbell-shoulder-press' || id === 'machine-shoulder-press', pattern: 'overhead_press' },

  // Side raises & rear delts
  { match: (id) => id === 'bent-over-lateral-raise' || id === 'reverse-fly' || id === 'rear-delt-machine', pattern: 'reverse_fly' },
  { match: (id) => id === 'lateral-raise' || id === 'cable-lateral-raise', pattern: 'lateral_raise' },
  { match: (id) => id === 'front-raise',             pattern: 'front_raise' },

  // Shrugs
  { match: (id) => id.includes('shrug'),             pattern: 'shrugs' },

  // Biceps curls
  { match: (id) => id === 'preacher-curl' || id === 'concentration-curl', pattern: 'preacher_curl' },
  { match: (id) => id.endsWith('-curl') || id.includes('curl'), pattern: 'curl' },

  // Triceps
  { match: (id) => id === 'french-press' || id === 'skull-crushers' || id === 'overhead-tricep-ext' || id === 'tricep-overhead-extension', pattern: 'overhead_tricep' },
  { match: (id) => id.includes('pushdown') || id === 'dumbbell-tricep-kickback' || id.includes('tricep'), pattern: 'tricep_pushdown' },

  // Abs
  { match: (id) => id === 'hanging-leg-raise',        pattern: 'hanging_leg_raise' },
  { match: (id) => id.includes('crunch') || id === 'v-ups' || id === 'bicycle-crunch' || id === 'ab-wheel-rollout', pattern: 'crunch' },

  // Wrist
  { match: (id) => id === 'wrist-curl',               pattern: 'wrist_curl' },
];

function classify(id) {
  for (const c of CLASSIFIERS) {
    if (c.match(id)) return c.pattern;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Generate the animations object
// ────────────────────────────────────────────────────────────────────────────
const result = {
  _comment: `Auto-generated by scripts/blender/generate-animations.mjs. One entry per exercise from src/data/exercises.ts. Each entry is a 5-keyframe 3-second loop driving the procedural stick-figure OR the Mixamo Xbot rig — the JSON format is shared between render_exercise.py and render_exercise_mixamo.py. Rotations are degrees, locations meters.`,
};

const classCounts = {};
const unmatched = [];

for (const id of ids) {
  const patternName = classify(id);
  if (!patternName) {
    unmatched.push(id);
    continue;
  }
  const pattern = PATTERNS[patternName];
  if (!pattern) {
    console.warn(`  warning: classified '${id}' as '${patternName}' but no such pattern defined`);
    unmatched.push(id);
    continue;
  }
  result[id] = pattern();
  classCounts[patternName] = (classCounts[patternName] ?? 0) + 1;
}

fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + '\n');

console.log('\nPattern usage:');
for (const [name, count] of Object.entries(classCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name.padEnd(22)} ${count}`);
}
console.log(`\nMatched: ${Object.keys(result).length - 1} / ${ids.length}`);
if (unmatched.length > 0) {
  console.log(`Unmatched: ${unmatched.join(', ')}`);
}
console.log(`\nWrote: ${path.relative(REPO_ROOT, OUT_FILE)}`);
