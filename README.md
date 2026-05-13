# Eisenhower Mobile

Mobile Eisenhower matrix app built with Expo and React Native.

## Features

- Four Eisenhower quadrants: Do Now, Schedule, Delegate, and Eliminate
- Add, edit, complete, delete, and drag tasks between quadrants
- Keyboard-aware task composer
- Local task persistence with AsyncStorage
- Android preview build configuration with EAS

## Development

Install dependencies:

```sh
npm install
```

Start Expo:

```sh
npm start
```

Run tests:

```sh
npm test -- --watch=false
```

Build an Android preview APK:

```sh
npx eas build --platform android --profile preview
```

## Project

This repository contains the Expo mobile app. Generated build outputs, local logs,
and APK files are intentionally excluded from git.
