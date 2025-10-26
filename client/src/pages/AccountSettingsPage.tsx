import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { authAPI } from '../services/api';
import { userCache } from '../services/userCache';
import type { UpdateCurrentUserRequest, User } from '../types';

const defaultFormState = (user: User | null) => ({
  username: user?.username ?? '',
  email: user?.email ?? '',
  avatar: user?.avatar ?? '',
  password: '',
  passwordConfirmation: '',
});

type FormState = ReturnType<typeof defaultFormState>;

type FieldErrorMap = Partial<
  Record<'username' | 'email' | 'avatar' | 'password' | 'passwordConfirmation' | 'general', string>
>;

const AccountSettingsPage: React.FC = () => {
  const cachedUser = userCache.getCurrentUser();
  const [currentUser, setCurrentUser] = useState<User | null>(cachedUser);
  const [formState, setFormState] = useState<FormState>(() => defaultFormState(cachedUser));
  const [isLoading, setIsLoading] = useState(!cachedUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const hasInitializedRef = useRef(Boolean(cachedUser));
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = userCache.subscribe((nextUser) => {
      if (!isMounted) {
        return;
      }

      setCurrentUser(nextUser);

      if (nextUser) {
        setLoadError('');
        setIsLoading(false);
      }

      if (nextUser && !hasInitializedRef.current) {
        setFormState(defaultFormState(nextUser));
        hasInitializedRef.current = true;
      }

      if (!nextUser) {
        hasInitializedRef.current = false;
        setIsLoading(false);
        setFormState(defaultFormState(null));
      }
    });

    const fetchUser = async () => {
      try {
        setIsLoading(true);
        setLoadError('');
        const user = await authAPI.getCurrentUser();
        if (isMounted) {
          userCache.setCurrentUser(user);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setLoadError('Failed to load account details.');
        setIsLoading(false);
      }
    };

    if (!hasInitializedRef.current) {
      void fetchUser();
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleFieldChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFormState((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const trimmedAvatar = useMemo(() => formState.avatar.trim(), [formState.avatar]);

  const hasProfileChanges = useMemo(() => {
    if (!currentUser) {
      return false;
    }

    return (
      formState.username.trim() !== currentUser.username ||
      formState.email.trim().toLowerCase() !== currentUser.email.toLowerCase() ||
      (trimmedAvatar || '') !== (currentUser.avatar ?? '')
    );
  }, [currentUser, formState.email, formState.username, trimmedAvatar]);

  const hasPasswordChanges = useMemo(() => formState.password.length > 0 || formState.passwordConfirmation.length > 0, [
    formState.password,
    formState.passwordConfirmation,
  ]);

  const resetPasswordFields = () => {
    setFormState((previous) => ({
      ...previous,
      password: '',
      passwordConfirmation: '',
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setSuccessMessage('');

    if (!currentUser) {
      setFieldErrors({ general: 'Unable to update profile until your account loads.' });
      return;
    }

    if (hasPasswordChanges && formState.password !== formState.passwordConfirmation) {
      setFieldErrors({ passwordConfirmation: 'Passwords do not match.' });
      return;
    }

    const payload: UpdateCurrentUserRequest = {};

    if (hasProfileChanges) {
      if (formState.username.trim() && formState.username.trim() !== currentUser.username) {
        payload.username = formState.username.trim();
      }

      if (formState.email.trim() && formState.email.trim().toLowerCase() !== currentUser.email.toLowerCase()) {
        payload.email = formState.email.trim();
      }

      if ((trimmedAvatar || '') !== (currentUser.avatar ?? '')) {
        payload.avatar = trimmedAvatar.length > 0 ? trimmedAvatar : null;
      }
    }

    if (hasPasswordChanges) {
      payload.password = formState.password;
      payload.password_confirmation = formState.passwordConfirmation;
    }

    if (Object.keys(payload).length === 0) {
      setSuccessMessage('Nothing to update — your settings are already current.');
      return;
    }

    setIsSubmitting(true);

    try {
      const updatedUser = await authAPI.updateCurrentUser(payload);
      userCache.setCurrentUser(updatedUser);
      setFormState((previous) => ({
        ...previous,
        username: updatedUser.username,
        email: updatedUser.email,
        avatar: updatedUser.avatar ?? '',
        password: '',
        passwordConfirmation: '',
      }));
      setSuccessMessage('Profile updated successfully.');
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        if (error.response.status === 401) {
          userCache.clear();
          navigate('/login');
          return;
        }

        const data = error.response.data as {
          error?: string;
          errors?: Record<string, string | string[]>;
        };

        const validationErrors: FieldErrorMap = {};

        if (data.errors) {
          for (const [key, value] of Object.entries(data.errors)) {
            const message = Array.isArray(value) ? value.join(' ') : value;
            if (key === 'password_confirmation') {
              validationErrors.passwordConfirmation = message;
            } else if (key in formState) {
              validationErrors[key as keyof FormState] = message;
            } else {
              validationErrors.general = message;
            }
          }
        } else if (data.error) {
          validationErrors.general = data.error;
        } else {
          validationErrors.general = 'Failed to update account settings.';
        }

        setFieldErrors(validationErrors);
      } else {
        setFieldErrors({ general: 'An unexpected error occurred while saving your settings.' });
      }
    } finally {
      setIsSubmitting(false);
      resetPasswordFields();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950/85" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800/70 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-slate-500">Account</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Profile &amp; Security</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage how other members see you and keep your credentials up to date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg border border-slate-800/70 px-3 py-2 text-sm text-slate-300 transition hover:border-primary-400 hover:text-primary-100"
            >
              Go back
            </button>
            <Link
              to="/chat"
              className="rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-2 text-sm font-semibold text-primary-100 transition hover:border-primary-400 hover:bg-primary-500/20"
            >
              Return to chat
            </Link>
          </div>
        </header>

        <section className="mt-8 flex-1">
          {loadError && (
            <div className="mb-6 rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {loadError}
            </div>
          )}

          {successMessage && (
            <div className="mb-6 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {successMessage}
            </div>
          )}

          {fieldErrors.general && (
            <div className="mb-6 rounded-lg border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {fieldErrors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            <fieldset className="space-y-4" disabled={isLoading || isSubmitting}>
              <legend className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Profile information
              </legend>

              <div className="space-y-2">
                <label htmlFor="username" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={formState.username}
                  onChange={handleFieldChange('username')}
                  className="w-full rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 transition focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-60"
                />
                {fieldErrors.username && <p className="text-xs text-red-300">{fieldErrors.username}</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formState.email}
                  onChange={handleFieldChange('email')}
                  className="w-full rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 transition focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-60"
                />
                {fieldErrors.email && <p className="text-xs text-red-300">{fieldErrors.email}</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="avatar" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Avatar URL
                </label>
                <input
                  id="avatar"
                  type="url"
                  value={formState.avatar}
                  onChange={handleFieldChange('avatar')}
                  placeholder="https://example.com/avatar.png"
                  className="w-full rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 transition focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-60"
                />
                {fieldErrors.avatar && <p className="text-xs text-red-300">{fieldErrors.avatar}</p>}
                {trimmedAvatar.length > 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                    <span className="font-semibold text-slate-200">Preview</span>
                    <img
                      src={trimmedAvatar}
                      alt="Avatar preview"
                      className="h-10 w-10 rounded-full border border-slate-800/70 object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                    <a
                      href={trimmedAvatar}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[11px] uppercase tracking-[0.3em] text-primary-200 hover:text-primary-100"
                    >
                      Open
                    </a>
                  </div>
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-4" disabled={isLoading || isSubmitting}>
              <legend className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Password
              </legend>

              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={formState.password}
                  onChange={handleFieldChange('password')}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 transition focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-60"
                />
                {fieldErrors.password && <p className="text-xs text-red-300">{fieldErrors.password}</p>}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="passwordConfirmation"
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400"
                >
                  Confirm new password
                </label>
                <input
                  id="passwordConfirmation"
                  type="password"
                  value={formState.passwordConfirmation}
                  onChange={handleFieldChange('passwordConfirmation')}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 transition focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-60"
                />
                {fieldErrors.passwordConfirmation && (
                  <p className="text-xs text-red-300">{fieldErrors.passwordConfirmation}</p>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Leave the password fields blank to keep your current password unchanged.
              </p>
            </fieldset>

            <div className="flex items-center justify-between border-t border-slate-800/70 pt-6">
              <div className="text-xs text-slate-500">
                {isLoading
                  ? 'Loading your latest profile details…'
                  : 'Changes apply immediately across BafaChat once saved.'}
              </div>
              <button
                type="submit"
                disabled={isLoading || isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg border border-primary-500/50 bg-primary-500/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-primary-50 transition hover:border-primary-400 hover:bg-primary-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default AccountSettingsPage;
