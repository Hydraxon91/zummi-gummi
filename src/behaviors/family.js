// Family task behavior: household meals, parent lessons and playdates.
//
// The shared familyTask travel/act state machine lives here. interactions.js
// remains the only writer of the task/partner protocol; this module calls
// startTask/cancelTask/endPair rather than assigning partner/familyTask.

import {
  addBond, pairBond, familyRelation, skillsFor, pushHistory, playdateDue,
  schedulePlaydate, nextPlaydateDay, teachSkill, strongestSkill, skillValue,
  PLAYDATE_WINDOW, routineWindowFor,
} from '../family.js';
import {
  INTERACTIONS, interactionFor, startTask, cancelTask,
  pairAvailable, endPair,
} from '../interactions.js';
import { defineBehaviorModule } from './module.js';

function playdateAnchor(ctx, partner) {
  const { actor, api } = ctx;
  const homes = api.homes();
  if (!Array.isArray(homes)) {
    return { x: (actor.cx + partner.cx) * .5, z: (actor.cz + partner.cz) * .5 };
  }
  const names = [actor.home, partner.home].filter(Boolean);
  const home = homes.find(candidate => names.includes(candidate.name));
  if (home) return { x: home.door.x, z: home.door.z, home: home.name };
  return { x: (actor.cx + partner.cx) * .5, z: (actor.cz + partner.cz) * .5 };
}

function acquireFamilyPlaymate(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || ai.familyPlayCooldown > 0 || ai.socialCooldown > 0) return null;
  if (!actor.parentUids || !actor.parentUids.length) return null;
  if (!api.isDayFor(actor)) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const other of api.actors()) {
    if (!pairAvailable(actor, other, { states: ['wander', 'seekCompany', 'stargaze', 'seekSocial'] })) continue;
    if (other.ai && (other.ai.familyPlayCooldown > 0 || other.ai.socialCooldown > 0)) continue;
    const kind = familyRelation(actor, other);
    if (!kind || (kind !== 'sibling' && kind !== 'parent' && kind !== 'child')) continue;
    const d = Math.hypot(actor.cx - other.cx, actor.cz - other.cz);
    if (d > 12) continue;
    const score = (kind === 'sibling' ? .35 : .2) + pairBond(actor, other) * .8 - d * .03;
    if (score > bestScore) { bestScore = score; best = { actor: other, kind }; }
  }
  return best;
}

function startPlaydate(ctx, partner, kind) {
  const { actor, ai, api } = ctx;
  if (!actor || !partner || !ai || !partner.ai) return false;
  api.releaseFood(actor);
  api.releaseFood(partner);
  const anchor = playdateAnchor(ctx, partner);
  const id = INTERACTIONS.familyPlaydate;
  startTask(actor, id, { role: 'host', partner, anchor, phase: 'travel' });
  ai.familyPlay = true;
  ai.playmateKind = kind;
  ai.playdate = true;
  ai.playdateHome = anchor.home || null;
  ai.playdateTarget = { x: anchor.x, z: anchor.z };
  startTask(partner, id, { role: 'guest', partner: actor, anchor, phase: 'travel' });
  partner.ai.familyPlay = true;
  partner.ai.playmateKind = kind;
  partner.ai.playdate = true;
  partner.ai.playdateHome = anchor.home || null;
  partner.ai.playdateTarget = { x: anchor.x, z: anchor.z };
  api.setDestination(actor, anchor.x, anchor.z);
  api.setDestination(partner, anchor.x, anchor.z);
  schedulePlaydate(actor, partner, { day: nextPlaydateDay(api.dayNow()), hour: PLAYDATE_WINDOW.start });
  return true;
}

function findDuePlaydate(ctx) {
  const { actor, api } = ctx;
  if (!actor || !actor.playdates) return null;
  if (!api.isDayFor(actor)) return null;
  const day = api.dayNow();
  const hour = api.hoursNow();
  for (const [uid, record] of Object.entries(actor.playdates)) {
    if (!playdateDue(record, day, hour)) continue;
    const other = api.actors().find(candidate => candidate.active && String(candidate.uid) === String(uid));
    if (!other) { delete actor.playdates[uid]; continue; }
    if (!pairAvailable(actor, other, { states: ['wander', 'seekCompany', 'stargaze', 'seekSocial'] })) continue;
    return { other, record };
  }
  return null;
}

function mealAnchor(ctx) {
  const { actor, api } = ctx;
  const home = api.homeFor(actor);
  if (!home) return null;
  let best = null;
  let bestD = 9;
  const food = api.food();
  if (food && typeof food.allRipe === 'function') {
    for (const source of food.allRipe({ safe: true })) {
      const d = Math.hypot(source.x - home.door.x, source.z - home.door.z);
      if (d < bestD) { bestD = d; best = source; }
    }
  }
  if (best) return { x: best.approachX, z: best.approachZ, home: home.name, foodId: best.id };
  return { x: home.door.x, z: home.door.z, home: home.name };
}

function mealWindow(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return null;
  const window = routineWindowFor(actor, api.hoursNow());
  if (!window || window.kind !== 'meal') return null;
  const key = `${api.dayNow()}:${window.name}`;
  if (ai.lastMealWindow === key) return null;
  if (ai.taskCooldown > 0) return null;
  if (actor.hunger >= p.thresholds.criticalHunger || actor.thirst >= p.thresholds.criticalThirst) return null;
  if (actor.hunger < .08) return null;
  return { window, key };
}

function startFamilyMeal(ctx, meal, immediate = false) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai) return false;
  const anchor = immediate
    ? { x: actor.cx, z: actor.cz, home: (api.homeFor(actor) || {}).name || null }
    : mealAnchor(ctx);
  if (!anchor) return false;
  startTask(actor, INTERACTIONS.familyMeal, {
    role: 'host',
    anchor,
    data: { routine: meal.window.name },
    phase: 'travel',
  });
  ai.lastMealWindow = meal.key;
  if (immediate || ai.familyTask.phase === 'act') {
    ai.familyTask.phase = 'act';
    api.stop(actor);
    return true;
  }
  if (!api.setDestination(actor, anchor.x, anchor.z)) {
    cancelTask(actor, { stop: api.stop });
    return false;
  }
  return true;
}

function lessonAnchor(ctx, teacher, student) {
  const { api } = ctx;
  const home = api.homeFor(teacher) || api.homeFor(student);
  if (home) return { x: home.door.x, z: home.door.z, home: home.name };
  return { x: (teacher.cx + student.cx) * .5, z: (teacher.cz + student.cz) * .5 };
}

function taughtToday(teacher, student, day) {
  const teacherHistory = teacher.history || [];
  const studentHistory = student.history || [];
  return teacherHistory.some(event => event.kind === 'lesson' && event.uid === student.uid && event.day === day) ||
    studentHistory.some(event => event.kind === 'taught' && event.uid === teacher.uid && event.day === day);
}

function lessonCandidate(ctx) {
  const { actor: teacher, api } = ctx;
  if (!teacher || !teacher.ai || teacher.stage !== 'adult') return null;
  if (!api.isDayFor(teacher) || teacher.ai.taskCooldown > 0) return null;
  const p = ctx.p;
  if (teacher.health < p.thresholds.healthHurt) return null;
  const day = api.dayNow();
  let best = null;
  for (const student of api.actors()) {
    if (!student || student === teacher || !student.active || !student.ai) continue;
    if (student.stage !== 'baby' && student.stage !== 'teen') continue;
    if (!(student.parentUids || []).includes(teacher.uid)) continue;
    if (student.sleeping || student.inside || student.grabs > 0 || student.inPond) continue;
    if (student.ai.partner || student.ai.directive) continue; // quirk 22: queued directives are not checked
    if (!['wander', 'follow'].includes(student.ai.state)) continue;
    if (Math.hypot(student.cx - teacher.cx, student.cz - teacher.cz) > 8) continue;
    if (taughtToday(teacher, student, day)) continue;
    const skill = strongestSkill(teacher);
    const teacherValue = skillValue(teacher, skill);
    if (teacherValue < .15) continue;
    if (teacherValue <= skillValue(student, skill) + .04) continue;
    const d = Math.hypot(student.cx - teacher.cx, student.cz - teacher.cz);
    const score = teacherValue * 2 - d * .04;
    if (!best || score > best.score) best = { student, skill, score };
  }
  return best;
}

function startLesson(ctx, student, immediate = false) {
  const teacher = ctx.actor;
  const { api } = ctx;
  if (!teacher || !student || !teacher.ai || !student.ai) return false;
  const anchor = immediate
    ? { x: (teacher.cx + student.cx) * .5, z: (teacher.cz + student.cz) * .5 }
    : lessonAnchor(ctx, teacher, student);
  startTask(teacher, INTERACTIONS.familyLesson, {
    role: 'teacher', partner: student, anchor,
    data: { skill: strongestSkill(teacher) }, phase: 'travel',
  });
  startTask(student, INTERACTIONS.familyLesson, {
    role: 'student', partner: teacher, anchor,
    data: { skill: strongestSkill(teacher) }, phase: 'travel',
  });
  if (immediate) {
    teacher.ai.familyTask.phase = 'act';
    student.ai.familyTask.phase = 'act';
    api.stop(teacher);
    api.stop(student);
    return true;
  }
  if (teacher.ai.familyTask.phase === 'act') api.stop(teacher);
  else api.setDestination(teacher, anchor.x, anchor.z);
  if (student.ai.familyTask.phase === 'act') api.stop(student);
  else api.setDestination(student, anchor.x, anchor.z);
  return true;
}

function finish(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || !ai.familyTask) return;
  const task = ai.familyTask;
  const partner = ai.partner;
  const day = api.dayNow();
  const hour = api.hoursNow();
  if (task.id === INTERACTIONS.familyPlaydate) {
    if (partner && partner.ai) {
      addBond(actor, partner, .18);
      actor.social = Math.max(0, actor.social - .42);
      actor.affection = Math.max(0, actor.affection - .30);
      partner.social = Math.max(0, partner.social - .42);
      partner.affection = Math.max(0, partner.affection - .30);
      pushHistory(actor, { kind: 'playdate', uid: partner.uid, day, hour });
      pushHistory(partner, { kind: 'playdate', uid: actor.uid, day, hour });
      actor.ai.familyPlayCooldown = 18;
      partner.ai.familyPlayCooldown = 18;
      schedulePlaydate(actor, partner, { day: nextPlaydateDay(api.dayNow()), hour: PLAYDATE_WINDOW.start });
      api.emit(actor, 'heart', .95);
    }
    endPair(actor, { stop: api.stop, next: 'wander', idleT: .6, taskCooldown: 1.0, socialCooldown: 8 });
  } else if (task.id === INTERACTIONS.familyLesson) {
    const teacher = task.role === 'teacher' ? actor : partner;
    const student = teacher === actor ? partner : actor;
    if (teacher && student) {
      const result = teachSkill(student, teacher);
      pushHistory(student, { kind: 'taught', uid: teacher.uid, day, hour });
      pushHistory(teacher, { kind: 'lesson', uid: student.uid, day, hour });
      api.emit(student, result.ok ? 'sparkle' : 'question', .95);
      endPair(actor, { stop: api.stop, next: 'wander', idleT: .6, taskCooldown: 1.5 });
    } else {
      cancelTask(actor, { stop: api.stop });
    }
  } else if (task.id === INTERACTIONS.familyMeal) {
    actor.hunger = Math.max(0, actor.hunger - .28);
    actor.social = Math.max(0, actor.social - .10);
    api.starsRescue?.(actor, 'food');
    let companion = null;
    let bestD = 2.6;
    for (const other of api.actors()) {
      if (!other || other === actor || !other.active || other.sleeping) continue;
      if (other.home !== actor.home) continue;
      const d = Math.hypot(other.cx - actor.cx, other.cz - actor.cz);
      if (d > 2.6) continue;
      addBond(actor, other, .05);
      if (d < bestD) { bestD = d; companion = other; }
    }
    pushHistory(actor, { kind: 'meal', uid: companion ? companion.uid : 0, day, hour });
    api.emit(actor, 'heart', .9);
    cancelTask(actor, { stop: api.stop });
  } else {
    cancelTask(actor, { stop: api.stop });
  }
  ai.familyPlay = false;
  ai.playmateKind = null;
  ai.playdate = false;
  ai.playdateHome = null;
  ai.playdateTarget = null;
}

export const familyTaskModule = defineBehaviorModule({
  id: 'family',
  label: 'Meals, lessons and playdates',
  states: ['familyTask'],
  activeStates: ['familyTask'],
  defaults: { enabled: true, params: {} },
  acquireFamilyPlaymate,
  startPlaydate,
  findDuePlaydate,
  mealWindow,
  startFamilyMeal,
  lessonCandidate,
  startLesson,
  finish,
  tick(ctx) {
    const { actor, ai, dt, api } = ctx;
    if (!ai || ai.state !== 'familyTask') return false;
    const task = ai.familyTask;
    if (!task) { ai.state = 'wander'; return true; }
    const def = interactionFor(task.id);
    const arriveDist = def ? def.arriveDist : 1.4;
    if (task.phase === 'travel') {
      if (!task.anchor) task.phase = 'act';
      else {
        const d = Math.hypot(task.anchor.x - actor.cx, task.anchor.z - actor.cz);
        if (d <= arriveDist) {
          task.phase = 'act';
          ai.moving = false;
          ai.path = null;
        } else if (!ai.moving || !ai.path || !ai.path.length) {
          if (!api.setDestination(actor, task.anchor.x, task.anchor.z)) {
            const partner = ai.partner;
            cancelTask(actor, { stop: api.stop });
            ai.idleT = .6;
            ai.taskCooldown = Math.max(ai.taskCooldown || 0, 2);
            ai.familyPlayCooldown = Math.max(ai.familyPlayCooldown || 0, 30);
            if (partner && partner.ai) {
              partner.ai.taskCooldown = Math.max(partner.ai.taskCooldown || 0, 2);
              partner.ai.familyPlayCooldown = Math.max(partner.ai.familyPlayCooldown || 0, 30);
            }
          }
        }
      }
    }
    if (task.phase === 'act') {
      task.t = Math.max(0, (Number.isFinite(task.t) ? task.t : 0) - dt);
      if (task.t <= 0) finish(ctx);
    }
    return true;
  },
  isTraveling(ctx) {
    const ai = ctx.ai;
    if (!ai || ai.state !== 'familyTask' || !ai.familyTask) return false;
    const task = ai.familyTask;
    if (task.phase !== 'travel') return false;
    const anchor = task.anchor;
    return !anchor || Math.hypot(anchor.x - ctx.actor.cx, anchor.z - ctx.actor.cz) > 1.5;
  },
});
