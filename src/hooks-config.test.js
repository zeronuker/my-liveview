import assert from 'node:assert/strict'
import { test } from 'node:test'

import { install, uninstall } from './hooks-config.js'

const URL = 'http://127.0.0.1:4747/event'
const rtk = { matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk hook claude' }] }
const existing = { hooks: { PreToolUse: [rtk] }, theme: 'dark' }

test('install adds the twenty-five events and keeps every existing hook and setting', () => {
  const next = install(existing, URL, 't0ken')

  assert.deepEqual(Object.keys(next.hooks).sort(), [
    'ConfigChange',
    'CwdChanged',
    'DirectoryAdded',
    'InstructionsLoaded',
    'Notification',
    'PermissionDenied',
    'PermissionRequest',
    'PostCompact',
    'PostModelSwitch',
    'PostToolBatch',
    'PostToolUse',
    'PostToolUseFailure',
    'PreCompact',
    'PreToolUse',
    'SessionEnd',
    'SessionStart',
    'Stop',
    'StopFailure',
    'SubagentStart',
    'SubagentStop',
    'TaskCompleted',
    'TaskCreated',
    'TeammateIdle',
    'UserPromptExpansion',
    'UserPromptSubmit',
  ])
  assert.deepEqual(next.hooks.PreToolUse[0], rtk)
  assert.equal(next.hooks.PreToolUse[1].matcher, '*')
  assert.equal(next.hooks.PreToolUse[1].hooks[0].headers['x-liveview-token'], 't0ken')
  assert.equal(next.theme, 'dark')
})

test('the first-message hook has no matcher and keeps someone else\'s hook on that event', () => {
  const theirs = { hooks: [{ type: 'command', command: 'notify' }] }
  const next = install({ hooks: { UserPromptSubmit: [theirs] } }, URL, 't0ken')

  assert.deepEqual(next.hooks.UserPromptSubmit[0], theirs)
  assert.equal('matcher' in next.hooks.UserPromptSubmit[1], false)
  assert.equal(next.hooks.UserPromptSubmit[1].hooks[0].url, URL)
})

test('install twice is the same as once', () => {
  const once = install(existing, URL, 't0ken')

  assert.deepEqual(install(once, URL, 't0ken'), once)
})

test('uninstall restores the settings it was given', () => {
  assert.deepEqual(uninstall(install(existing, URL, 't0ken'), URL), existing)
  assert.deepEqual(uninstall(install({}, URL, 't0ken'), URL), {})
})

test('the input settings are not changed', () => {
  const copy = structuredClone(existing)
  install(existing, URL, 't0ken')

  assert.deepEqual(existing, copy)
})
