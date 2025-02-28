/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

const execMock = jest.fn();
const echoMock = jest.fn();
const exitMock = jest.fn();
const isTaggedLatestMock = jest.fn();
const publishAndroidArtifactsToMavenMock = jest.fn();
const env = process.env;

jest
  .mock('shelljs', () => ({
    exec: execMock,
    echo: echoMock,
    exit: exitMock,
  }))
  .mock('./../scm-utils', () => ({
    exitIfNotOnGit: command => command(),
    getCurrentCommit: () => 'currentco_mmit',
    isTaggedLatest: isTaggedLatestMock,
  }))
  .mock('path', () => ({
    join: () => '../packages/react-native',
  }))
  .mock('fs')
  .mock('./../release-utils', () => ({
    generateAndroidArtifacts: jest.fn(),
    publishAndroidArtifactsToMaven: publishAndroidArtifactsToMavenMock,
  }));

const date = new Date('2023-04-20T23:52:39.543Z');

const publishNpm = require('../publish-npm');

describe('publish-npm', () => {
  beforeAll(() => {
    jest.useFakeTimers({legacyFakeTimers: false});
    jest.setSystemTime(date);
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  afterEach(() => {
    process.env = env;
  });

  afterEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
  });

  describe('dry-run', () => {
    it('should set version and not publish', () => {
      execMock.mockReturnValueOnce({code: 0});

      publishNpm('dry-run');

      expect(exitMock).toHaveBeenCalledWith(0);
      expect(isTaggedLatestMock.mock.calls).toHaveLength(0);
      expect(echoMock).toHaveBeenCalledWith(
        'Skipping `npm publish` because --dry-run is set.',
      );
      expect(execMock).toHaveBeenCalledWith(
        'node scripts/set-rn-version.js --to-version 1000.0.0-currentco --build-type dry-run',
      );
      expect(execMock.mock.calls).toHaveLength(1);
    });
  });

  describe('nightly', () => {
    it('should publish', () => {
      execMock
        .mockReturnValueOnce({stdout: '0.81.0-rc.1\n', code: 0})
        .mockReturnValueOnce({code: 0})
        .mockReturnValueOnce({code: 0});
      const expectedVersion = '0.82.0-nightly-20230420-currentco';

      publishNpm('nightly');

      expect(publishAndroidArtifactsToMavenMock).toHaveBeenCalledWith(
        expectedVersion,
        true,
      );
      expect(execMock.mock.calls[0][0]).toBe(
        `npm view react-native dist-tags.next`,
      );
      expect(execMock.mock.calls[1][0]).toBe(
        `node scripts/set-rn-version.js --to-version ${expectedVersion} --build-type nightly`,
      );
      expect(execMock.mock.calls[2][0]).toBe('npm publish --tag nightly');
      expect(echoMock).toHaveBeenCalledWith(
        `Published to npm ${expectedVersion}`,
      );
      expect(exitMock).toHaveBeenCalledWith(0);
      expect(execMock.mock.calls).toHaveLength(3);
    });

    it('should fail to set version', () => {
      execMock
        .mockReturnValueOnce({stdout: '0.81.0-rc.1\n', code: 0})
        .mockReturnValueOnce({code: 1});
      const expectedVersion = '0.82.0-nightly-20230420-currentco';

      publishNpm('nightly');

      expect(publishAndroidArtifactsToMavenMock).not.toBeCalled();
      expect(execMock.mock.calls[0][0]).toBe(
        `npm view react-native dist-tags.next`,
      );
      expect(execMock.mock.calls[1][0]).toBe(
        `node scripts/set-rn-version.js --to-version ${expectedVersion} --build-type nightly`,
      );
      expect(echoMock).toHaveBeenCalledWith(
        `Failed to set version number to ${expectedVersion}`,
      );
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(execMock.mock.calls).toHaveLength(2);
    });
  });

  describe('release', () => {
    it('should fail with invalid release version', () => {
      process.env.CIRCLE_TAG = '1.0.1';
      expect(() => {
        publishNpm('release');
      }).toThrow('Version 1.0.1 is not valid for Release');
      expect(publishAndroidArtifactsToMavenMock).not.toBeCalled();
    });

    it('should publish non-latest', () => {
      execMock.mockReturnValueOnce({code: 0});
      isTaggedLatestMock.mockReturnValueOnce(false);
      process.env.CIRCLE_TAG = '0.81.1';
      process.env.NPM_CONFIG_OTP = 'otp';

      publishNpm('release');

      const expectedVersion = '0.81.1';
      expect(publishAndroidArtifactsToMavenMock).toHaveBeenCalledWith(
        expectedVersion,
        false,
      );
      expect(execMock).toHaveBeenCalledWith(
        `npm publish --tag 0.81-stable --otp otp`,
        {cwd: '../packages/react-native'},
      );
      expect(echoMock).toHaveBeenCalledWith(
        `Published to npm ${expectedVersion}`,
      );
      expect(exitMock).toHaveBeenCalledWith(0);
      expect(execMock.mock.calls).toHaveLength(1);
    });

    it('should publish latest stable', () => {
      execMock.mockReturnValueOnce({code: 0});
      isTaggedLatestMock.mockReturnValueOnce(true);
      process.env.CIRCLE_TAG = '0.81.1';
      process.env.NPM_CONFIG_OTP = 'otp';

      publishNpm('release');

      const expectedVersion = '0.81.1';
      expect(publishAndroidArtifactsToMavenMock).toHaveBeenCalledWith(
        expectedVersion,
        false,
      );
      expect(execMock).toHaveBeenCalledWith(
        `npm publish --tag latest --otp ${process.env.NPM_CONFIG_OTP}`,
        {cwd: '../packages/react-native'},
      );
      expect(echoMock).toHaveBeenCalledWith(
        `Published to npm ${expectedVersion}`,
      );
      expect(exitMock).toHaveBeenCalledWith(0);
      expect(execMock.mock.calls).toHaveLength(1);
    });

    it('should fail to publish latest stable', () => {
      execMock.mockReturnValueOnce({code: 1});
      isTaggedLatestMock.mockReturnValueOnce(true);
      process.env.CIRCLE_TAG = '0.81.1';
      process.env.NPM_CONFIG_OTP = 'otp';

      publishNpm('release');

      const expectedVersion = '0.81.1';
      expect(publishAndroidArtifactsToMavenMock).toHaveBeenCalledWith(
        expectedVersion,
        false,
      );
      expect(execMock).toHaveBeenCalledWith(
        `npm publish --tag latest --otp ${process.env.NPM_CONFIG_OTP}`,
        {cwd: '../packages/react-native'},
      );
      expect(echoMock).toHaveBeenCalledWith(`Failed to publish package to npm`);
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(execMock.mock.calls).toHaveLength(1);
    });

    it('should publish next', () => {
      execMock.mockReturnValueOnce({code: 0});
      isTaggedLatestMock.mockReturnValueOnce(true);
      process.env.CIRCLE_TAG = '0.81.0-rc.4';
      process.env.NPM_CONFIG_OTP = 'otp';

      publishNpm('release');

      const expectedVersion = '0.81.0-rc.4';
      expect(publishAndroidArtifactsToMavenMock).toHaveBeenCalledWith(
        expectedVersion,
        false,
      );
      expect(execMock).toHaveBeenCalledWith(
        `npm publish --tag next --otp ${process.env.NPM_CONFIG_OTP}`,
        {cwd: '../packages/react-native'},
      );
      expect(echoMock).toHaveBeenCalledWith(
        `Published to npm ${expectedVersion}`,
      );
      expect(exitMock).toHaveBeenCalledWith(0);
      expect(execMock.mock.calls).toHaveLength(1);
    });
  });
});
