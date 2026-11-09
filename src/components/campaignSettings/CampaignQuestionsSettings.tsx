import { useState } from "react";
import { useParams } from "react-router";
import { v4 as uuidv4 } from "uuid";

import { MAX_QUESTIONS, QUESTION_PROMPT_MAX_LENGTH, updateCampaignQuestions } from "../../api/campaigns";
import type { campaignQuestion } from "../../datatypes/campaignDetails";
import { SectionHeader, type SectionMode } from "./SectionHeader";
import { useReadOnly } from "./ReadOnly";
import "./CampaignSettings.css";

// The GM's custom questions, asked on the character wizard's Details step under the name.
// View lists them; Edit changes a copy, saved all at once (the server replaces the list).
// A question keeps its id when reworded or moved, so players' answers stay with it.
export function CampaignQuestionsSettings({ questions, onSaved }: {
    questions: campaignQuestion[];
    onSaved: (questions: campaignQuestion[]) => void;
}) {
    const { campaignID } = useParams();
    const readOnly = useReadOnly()
    const [mode, setMode] = useState<SectionMode>('view')
    const [draft, setDraft] = useState<campaignQuestion[]>([])
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    function changeMode(next: SectionMode) {
        if (next === 'edit') {
            setDraft(questions.map(q => ({ ...q })))
            setError(null)
        }
        setMode(next)
    }

    const change = (index: number, patch: Partial<campaignQuestion>) =>
        setDraft(list => list.map((q, i) => (i === index ? { ...q, ...patch } : q)))
    const remove = (index: number) => setDraft(list => list.filter((_, i) => i !== index))
    const move = (index: number, by: number) => setDraft(list => {
        const next = [...list]
        const [q] = next.splice(index, 1)
        next.splice(index + by, 0, q)
        return next
    })
    const add = () => setDraft(list => [...list, { id: uuidv4(), prompt: '', required: false }])

    const blank = draft.some(q => !q.prompt.trim())

    function handleSave() {
        const cleaned = draft.map(q => ({ ...q, prompt: q.prompt.trim() }))
        setSaving(true)
        updateCampaignQuestions(campaignID as string, cleaned)
            .then(() => {
                onSaved(cleaned)
                setMode('view')
            })
            .catch(err => setError(err.response?.data?.error ?? 'Could not save the questions.'))
            .finally(() => setSaving(false))
    }

    return (
        <div className="setting-section custom-questions">
            <SectionHeader caption="Custom Questions" mode={mode} onModeChange={changeMode}/>
            {mode === 'view' || readOnly ? (
                questions.length === 0 ? (
                    <p className="muted">No custom questions. Players see only the usual details.</p>
                ) : (
                    <ol className="custom-questions__list">
                        {questions.map(q => (
                            <li key={q.id}>
                                {q.prompt}
                                <span className="setting-hint">{q.required ? 'Required' : 'Optional'}</span>
                            </li>
                        ))}
                    </ol>
                )
            ) : (
                <>
                    <p className="setting-hint">Asked on the Details step, under the character’s name.</p>
                    {draft.map((q, i) => (
                        <div key={q.id} className="custom-questions__row">
                            <input
                                className="campaign-name__input"
                                aria-label={`Question ${i + 1}`}
                                placeholder="What do you want to ask?"
                                value={q.prompt}
                                maxLength={QUESTION_PROMPT_MAX_LENGTH}
                                autoFocus={i === draft.length - 1 && !q.prompt}
                                onChange={e => change(i, { prompt: e.target.value })}
                            />
                            <label className="custom-questions__required">
                                <input type="checkbox" checked={q.required} onChange={e => change(i, { required: e.target.checked })}/>
                                Required
                            </label>
                            <button type="button" className="icon-button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                            <button type="button" className="icon-button" aria-label="Move down" disabled={i === draft.length - 1} onClick={() => move(i, 1)}>↓</button>
                            <button type="button" className="icon-button" aria-label="Remove question" onClick={() => remove(i)}>×</button>
                        </div>
                    ))}
                    <div className="campaign-description__actions">
                        {error && <p className="campaign-name__error">{error}</p>}
                        {blank && <p className="campaign-name__error">Every question needs a prompt.</p>}
                        <button type="button" className="setting-button setting-button--quiet"
                            disabled={draft.length >= MAX_QUESTIONS} onClick={add}>
                            Add Question
                        </button>
                        <button type="button" className="setting-button setting-button--quiet" onClick={() => setMode('view')}>
                            Cancel
                        </button>
                        <button type="button" className="setting-button" disabled={saving || blank} onClick={handleSave}>Save</button>
                    </div>
                </>
            )}
        </div>
    )
}
