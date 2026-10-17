/** Bound work and reject control characters; never put the input in an error. */
export const MAX_PASSWORD_LENGTH = 1024;
export function validatePassword(password, { allowEmpty = false } = {}) {
  if (typeof password !== 'string') throw new TypeError('Password input must be text.');
  if (!allowEmpty && password.length === 0) throw new RangeError('Enter a password first.');
  if (password.length > MAX_PASSWORD_LENGTH)
    throw new RangeError('Passwords are limited to 1,024 UTF-16 code units.');
  if (/[\u0000-\u001f\u007f]/u.test(password))
    throw new RangeError(
      'Control characters are not supported. Spaces and Unicode characters are supported.',
    );
  return password;
}
