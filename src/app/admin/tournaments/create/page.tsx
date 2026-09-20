'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/admin-shell';
import {
  DEFAULT_FORM,
  TournamentForm,
  type TournamentFormValues,
} from '@/components/admin/tournament-form';
import { ApiClientError, api } from '@/lib/client/api';
import type { TournamentSummaryDTO } from '@/types';

export default function CreateTournamentPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<TournamentFormValues>(DEFAULT_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      const result = await api.post<{ tournament: TournamentSummaryDTO }>('/api/tournaments', {
        ...form,
        description: form.description || null,
        coverImageUrl: form.coverImageUrl || null,
        rules: form.rules || null,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
        endAt: null,
      });

      toast.success(`Created · code ${result.tournament.code}`);
      router.push(`/admin/tournaments/${result.tournament.id}/questions`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fieldErrors ?? { form: error.message });
        toast.error(error.message);
      } else {
        setErrors({ form: 'Could not create the tournament.' });
      }
      setSaving(false);
    }
  };

  return (
    <AdminShell
      kicker="New event"
      title="Build a tournament"
    >
      <p className="mb-8 max-w-xl text-[14px] leading-relaxed text-smoke">
        Set the shape of the competition now. Everything stays editable until the first round goes
        live, and you will get a join code as soon as it is created.
      </p>

      <TournamentForm
        value={form}
        onChange={setForm}
        onSubmit={submit}
        saving={saving}
        errors={errors}
        submitLabel="Create & add rounds"
      />
    </AdminShell>
  );
}
