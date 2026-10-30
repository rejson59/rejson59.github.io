import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const realm = JSON.parse(await readFile(new URL('../realm/rejson-demo-realm.json', import.meta.url), 'utf8'));
test('konfiguracja demonstracyjna: nazwa i hasło, brak e-maila i zamknięte przepływy', () => {
  assert.equal(realm.registrationAllowed, true);
  assert.equal(realm.verifyEmail, false);
  assert.equal(realm.resetPasswordAllowed, false);
  assert.equal(realm.loginWithEmailAllowed, false);
  assert.match(realm.passwordPolicy, /length\(12\)/);
  assert.equal(realm.bruteForceProtected, true);
  assert.equal(realm.permanentLockout, false);
  assert.equal(realm.failureFactor, 5);
  const profiles = realm.components['org.keycloak.userprofile.UserProfileProvider'];
  const profile = JSON.parse(profiles[0].config['kc.user.profile.config'][0]);
  assert.ok(profile.attributes.find(x => x.name === 'username').required);
  for (const key of ['email', 'firstName', 'lastName']) assert.equal(profile.attributes.find(x => x.name === key).required, undefined);
  assert.equal(realm.clients.length, 2);
  for (const c of realm.clients) {
    assert.deepEqual(c.redirectUris, [`http://localhost:4173/${c.clientId}/callback.html`]);
    assert.deepEqual(c.webOrigins, ['http://localhost:4173']);
    assert.equal(c.publicClient, true);
    assert.equal(c.standardFlowEnabled, true);
    assert.equal(c.implicitFlowEnabled, false);
    assert.equal(c.directAccessGrantsEnabled, false);
    assert.equal(c.attributes['pkce.code.challenge.method'], 'S256');
  }
});
