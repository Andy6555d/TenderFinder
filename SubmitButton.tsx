'use client'
import { useFormStatus } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

// Wraps any form's submit button with live feedback: shows a pending label while the server
// action is running, then briefly shows a confirmation label once it completes, before reverting
// to normal. Needs to be a child of the <form> it belongs to - useFormStatus only sees the
// nearest enclosing form.
export default function SubmitButton({
  children, pendingLabel, doneLabel, className = 'btn btn-primary', disabled
}: {
  children: React.ReactNode
  pendingLabel?: string
  doneLabel?: string
  className?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  const wasPending = useRef(false)
  const [justDone, setJustDone] = useState(false)

  useEffect(() => {
    if (wasPending.current && !pending && doneLabel) {
      setJustDone(true)
      const t = setTimeout(() => setJustDone(false), 1700)
      return () => clearTimeout(t)
    }
    wasPending.current = pending
  }, [pending, doneLabel])

  return (
    <button className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? (pendingLabel || 'Working…') : justDone ? (doneLabel || 'Done') : children}
    </button>
  )
}
