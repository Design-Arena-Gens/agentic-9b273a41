type LightState = {
  location: string;
  on: boolean;
  brightness: number;
};

type ThermostatState = {
  temperature: number;
  mode: "cool" | "heat" | "eco" | "off";
};

type MusicState = {
  playing: boolean;
  track: string | null;
  volume: number;
};

type SecurityState = {
  armed: boolean;
  mode: "home" | "away";
};

import { randomUUID } from "crypto";

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

type Task = {
  id: string;
  title: string;
  due?: string;
  completed: boolean;
};

export type SmartHomeState = {
  lights: Record<string, LightState>;
  thermostat: ThermostatState;
  music: MusicState;
  security: SecurityState;
  tasks: Task[];
  lastUpdated: string;
};

export type AgentResponse = {
  reply: string;
  actions: string[];
  state: SmartHomeState;
};

const defaultState: SmartHomeState = {
  lights: {
    living: { location: "living room", on: false, brightness: 40 },
    kitchen: { location: "kitchen", on: false, brightness: 50 },
    bedroom: { location: "bedroom", on: false, brightness: 25 },
  },
  thermostat: {
    temperature: 72,
    mode: "eco",
  },
  music: {
    playing: false,
    track: null,
    volume: 45,
  },
  security: {
    armed: false,
    mode: "home",
  },
  tasks: [],
  lastUpdated: new Date().toISOString(),
};

const smartHomeState: SmartHomeState = deepClone(defaultState);

const lightAliases: Record<string, string> = {
  living: "living",
  "living room": "living",
  lounge: "living",
  kitchen: "kitchen",
  cook: "kitchen",
  bedroom: "bedroom",
  bed: "bedroom",
  master: "bedroom",
};

function identifyLight(command: string): string | null {
  for (const [alias, key] of Object.entries(lightAliases)) {
    if (command.includes(alias)) {
      return key;
    }
  }
  return null;
}

function setAllLights(on: boolean, actions: string[]): void {
  Object.values(smartHomeState.lights).forEach((light) => {
    light.on = on;
    actions.push(`${on ? "Activated" : "Deactivated"} ${light.location} lights`);
  });
}

function adjustBrightness(delta: number, actions: string[]): void {
  Object.values(smartHomeState.lights).forEach((light) => {
    light.brightness = clamp(light.brightness + delta, 0, 100);
    if (light.on || delta > 0) {
      light.on = light.brightness > 0;
    }
    actions.push(
      `Set ${light.location} brightness to ${light.brightness.toFixed(0)}%`,
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function handleLightCommand(command: string, actions: string[]): string | null {
  const locationKey = identifyLight(command);
  const target =
    locationKey != null ? smartHomeState.lights[locationKey] : null;

  if (command.includes("turn on") || command.includes("switch on")) {
    if (locationKey && target) {
      target.on = true;
      target.brightness = Math.max(target.brightness, 60);
      actions.push(`Turned on ${target.location} lights`);
      return `Turning on the ${target.location} lights.`;
    }
    setAllLights(true, actions);
    return "Turning on all configured lights.";
  }

  if (command.includes("turn off") || command.includes("switch off")) {
    if (locationKey && target) {
      target.on = false;
      actions.push(`Turned off ${target.location} lights`);
      return `Turning off the ${target.location} lights.`;
    }
    setAllLights(false, actions);
    return "Turning off every light in the home.";
  }

  const brightnessMatch =
    command.match(/(\d+)\s?%/) ?? command.match(/(\d+)\s?(?:percent|brightness)/);
  if (brightnessMatch && (locationKey && target)) {
    const level = clamp(Number(brightnessMatch[1]), 0, 100);
    target.brightness = level;
    target.on = level > 0;
    actions.push(`Adjusted ${target.location} brightness to ${level}%`);
    return `Setting the ${target.location} lights to ${level}% brightness.`;
  }

  if (command.includes("dim") || command.includes("lower")) {
    if (locationKey && target) {
      target.brightness = clamp(target.brightness - 20, 0, 100);
      target.on = target.brightness > 0;
      actions.push(
        `Dimmed ${target.location} lights to ${target.brightness}% brightness`,
      );
      return `Dimming the ${target.location} lights.`;
    }
    adjustBrightness(-20, actions);
    return "Dimming the house lights.";
  }

  if (command.includes("brighten") || command.includes("increase")) {
    if (locationKey && target) {
      target.brightness = clamp(target.brightness + 20, 0, 100);
      target.on = true;
      actions.push(
        `Brightened ${target.location} lights to ${target.brightness}% brightness`,
      );
      return `Brightening the ${target.location} lights.`;
    }
    adjustBrightness(20, actions);
    return "Brightening the lights across the home.";
  }

  if (command.includes("status") && (command.includes("light") || command.includes("lights"))) {
    const summary = Object.values(smartHomeState.lights)
      .map(
        (light) =>
          `${light.location}: ${light.on ? "on" : "off"} at ${light.brightness}%`,
      )
      .join("; ");
    return `Here is the lighting summary: ${summary}.`;
  }

  return null;
}

function handleThermostatCommand(
  command: string,
  actions: string[],
): string | null {
  const numberMatch = command.match(/(\d{2})(?:\s?degrees|°|)/);
  if (numberMatch) {
    const targetTemp = clamp(Number(numberMatch[1]), 55, 85);
    smartHomeState.thermostat.temperature = targetTemp;
    actions.push(`Set thermostat to ${targetTemp}°F`);
    return `Setting the thermostat to ${targetTemp} degrees Fahrenheit.`;
  }

  if (command.includes("cool") || command.includes("ac")) {
    smartHomeState.thermostat.mode = "cool";
    actions.push("Thermostat set to cooling mode");
    return "Switching the thermostat to cooling mode.";
  }

  if (command.includes("heat") || command.includes("heating")) {
    smartHomeState.thermostat.mode = "heat";
    actions.push("Thermostat set to heating mode");
    return "Switching the thermostat to heating mode.";
  }

  if (command.includes("eco") || command.includes("energy saver")) {
    smartHomeState.thermostat.mode = "eco";
    actions.push("Thermostat set to eco mode");
    return "Thermostat is now in eco mode.";
  }

  if (command.includes("turn off") && command.includes("thermostat")) {
    smartHomeState.thermostat.mode = "off";
    actions.push("Thermostat turned off");
    return "Turning the thermostat off.";
  }

  if (command.includes("temperature") || command.includes("thermostat")) {
    const { temperature, mode } = smartHomeState.thermostat;
    return `The thermostat is set to ${temperature} degrees in ${mode} mode.`;
  }

  return null;
}

function handleMusicCommand(command: string, actions: string[]): string | null {
  if (command.includes("play")) {
    const track =
      command.match(/play (.+)/)?.[1]?.replace("music", "").trim() ?? "playlist";
    smartHomeState.music.playing = true;
    smartHomeState.music.track = track;
    actions.push(`Now playing ${track}`);
    return `Starting ${track} on the smart speakers.`;
  }

  if (command.includes("pause") || command.includes("stop")) {
    smartHomeState.music.playing = false;
    const track = smartHomeState.music.track;
    smartHomeState.music.track = track;
    actions.push("Paused the speakers");
    return track
      ? `Pausing ${track}.`
      : "Pausing playback on the smart speakers.";
  }

  if (command.includes("skip")) {
    actions.push("Skipped to the next track");
    return "Skipping to the next track.";
  }

  if (command.includes("volume up") || command.includes("louder")) {
    smartHomeState.music.volume = clamp(smartHomeState.music.volume + 10, 0, 100);
    actions.push(`Increased speaker volume to ${smartHomeState.music.volume}%`);
    return "Turning the music up.";
  }

  if (command.includes("volume down") || command.includes("quieter")) {
    smartHomeState.music.volume = clamp(smartHomeState.music.volume - 10, 0, 100);
    actions.push(`Lowered speaker volume to ${smartHomeState.music.volume}%`);
    return "Lowering the music volume.";
  }

  if (command.includes("music status") || command.includes("what's playing")) {
    if (!smartHomeState.music.playing || !smartHomeState.music.track) {
      return "Nothing is currently playing.";
    }
    return `Currently playing ${smartHomeState.music.track} at ${smartHomeState.music.volume}% volume.`;
  }

  return null;
}

function handleSecurityCommand(
  command: string,
  actions: string[],
): string | null {
  if (command.includes("arm")) {
    smartHomeState.security.armed = true;
    smartHomeState.security.mode = command.includes("away") ? "away" : "home";
    actions.push(
      `Armed security system in ${smartHomeState.security.mode} mode`,
    );
    return `Arming the security system in ${smartHomeState.security.mode} mode.`;
  }

  if (command.includes("disarm")) {
    smartHomeState.security.armed = false;
    actions.push("Disarmed security system");
    return "Disarming the security system.";
  }

  if (command.includes("security status") || command.includes("alarm status")) {
    const { armed, mode } = smartHomeState.security;
    return armed
      ? `The security system is armed in ${mode} mode.`
      : "The security system is currently disarmed.";
  }

  return null;
}

function handleTaskCommand(command: string, actions: string[]): string | null {
  if (command.includes("add") && command.includes("reminder")) {
    const reminder = command.split("reminder").pop()?.trim() ?? "general task";
    const task: Task = {
      id: randomUUID(),
      title: capitalize(reminder),
      completed: false,
    };
    smartHomeState.tasks.push(task);
    actions.push(`Created reminder: ${task.title}`);
    return `Reminder added for ${task.title}.`;
  }

  if (command.includes("list") && command.includes("reminder")) {
    if (smartHomeState.tasks.length === 0) {
      return "You have no reminders right now.";
    }
    const summary = smartHomeState.tasks
      .filter((task) => !task.completed)
      .map((task) => `• ${task.title}`)
      .join(" ");
    return `Here are your active reminders: ${summary}`;
  }

  if (command.includes("complete") || command.includes("done with")) {
    const match = command.match(/complete (.+)/) ?? command.match(/done with (.+)/);
    if (match) {
      const query = match[1].trim().toLowerCase();
      const task = smartHomeState.tasks.find((t) =>
        t.title.toLowerCase().includes(query),
      );
      if (task) {
        task.completed = true;
        actions.push(`Completed reminder: ${task.title}`);
        return `Marked ${task.title} as complete.`;
      }
    }
    return "I couldn't find a matching reminder to complete.";
  }

  return null;
}

const handlers: Array<
  (command: string, actions: string[]) => string | null
> = [
  handleLightCommand,
  handleThermostatCommand,
  handleMusicCommand,
  handleSecurityCommand,
  handleTaskCommand,
];

function buildStatusReport(): string {
  const lightSummary = Object.values(smartHomeState.lights)
    .map(
      (light) =>
        `${light.location} lights ${light.on ? "on" : "off"} at ${light.brightness}%`,
    )
    .join("; ");
  const thermostat = smartHomeState.thermostat;
  const music = smartHomeState.music;
  const security = smartHomeState.security;

  return [
    `Lighting: ${lightSummary}.`,
    `Thermostat: ${thermostat.temperature}°F in ${thermostat.mode} mode.`,
    `Music: ${music.playing ? `Playing ${music.track} at ${music.volume}%` : "Idle"}.`,
    `Security: ${security.armed ? `Armed (${security.mode})` : "Disarmed"}.`,
  ].join(" ");
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

export function processCommand(rawCommand: string): AgentResponse {
  const command = rawCommand.trim().toLowerCase();
  const actions: string[] = [];
  let reply: string | null = null;

  if (!command) {
    return {
      reply: "Please say something so I can help.",
      actions,
      state: { ...smartHomeState, lastUpdated: new Date().toISOString() },
    };
  }

  for (const handler of handlers) {
    reply = handler(command, actions);
    if (reply) break;
  }

  if (!reply) {
    if (command.includes("status") || command.includes("everything")) {
      reply = buildStatusReport();
    } else if (command.includes("reset")) {
      Object.assign(smartHomeState, deepClone(defaultState));
      actions.push("Reset environment to defaults");
      reply = "I've reset the smart home to its default configuration.";
    } else {
      reply =
        "I'm not sure how to handle that yet. Try asking about lights, thermostat, music, security, or reminders.";
    }
  }

  smartHomeState.lastUpdated = new Date().toISOString();

  return {
    reply,
    actions,
    state: {
      lights: deepClone(smartHomeState.lights),
      thermostat: { ...smartHomeState.thermostat },
      music: { ...smartHomeState.music },
      security: { ...smartHomeState.security },
      tasks: smartHomeState.tasks.map((task) => ({ ...task })),
      lastUpdated: smartHomeState.lastUpdated,
    },
  };
}
