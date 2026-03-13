"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSelector } from "./page-selector";
import { GarminConnectForm } from "./garmin-connect-form";
import { WorkoutPreview } from "./workout-preview";
import type { ParsedWorkout } from "@/lib/core/types";

const STEPS = [
  { label: "Select Page", number: 1 },
  { label: "Connect Garmin", number: 2 },
  { label: "Push Workouts", number: 3 },
  { label: "Done", number: 4 },
] as const;

interface WorkoutSyncData {
  pageId: string;
  pageTitle: string;
  workouts: ParsedWorkout[];
}

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [syncData, setSyncData] = useState<WorkoutSyncData | null>(null);
  const [garminConnected, setGarminConnected] = useState(false);

  function handlePageSelected(
    pageId: string,
    pageTitle: string,
    workouts: ParsedWorkout[],
  ) {
    setSyncData({ pageId, pageTitle, workouts });
  }

  function canGoNext(): boolean {
    switch (currentStep) {
      case 1:
        return syncData !== null;
      case 2:
        return garminConnected;
      case 3:
        return true;
      default:
        return false;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step) => (
          <div key={step.number} className="flex items-center gap-2">
            <Badge
              variant={
                currentStep === step.number
                  ? "default"
                  : currentStep > step.number
                    ? "secondary"
                    : "outline"
              }
              className="h-6 min-w-6 justify-center"
            >
              {currentStep > step.number ? (
                <CheckIcon />
              ) : (
                step.number
              )}
            </Badge>
            <span
              className={`text-sm ${
                currentStep === step.number
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
            {step.number < STEPS.length && (
              <div className="mx-1 h-px w-6 bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {currentStep === 1 && "Select your training page"}
            {currentStep === 2 && "Connect Garmin"}
            {currentStep === 3 && "Push workouts to Garmin"}
            {currentStep === 4 && "You're all set"}
          </CardTitle>
          <CardDescription>
            {currentStep === 1 &&
              "Choose the Notion page that contains your workout plan."}
            {currentStep === 2 &&
              "Enter your Garmin Connect credentials to enable workout sync."}
            {currentStep === 3 &&
              "Review your workouts and sync them to Garmin Connect."}
            {currentStep === 4 &&
              "Your workouts are on Garmin. Sync your watch and start training."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <PageSelector
              selectedPageId={syncData?.pageId ?? null}
              onPageSelected={handlePageSelected}
            />
          )}
          {currentStep === 2 && (
            <GarminConnectForm
              connected={garminConnected}
              onConnected={() => setGarminConnected(true)}
            />
          )}
          {currentStep === 3 && syncData && (
            <WorkoutPreview
              pageId={syncData.pageId}
              workouts={syncData.workouts}
            />
          )}
          {currentStep === 4 && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircleIcon />
              </div>
              <p className="text-center text-muted-foreground">
                GarminMD will analyze your performance after each workout and
                deliver coaching insights on your dashboard.
              </p>
              <a
                href="/dashboard"
                className={buttonVariants({ size: "lg" })}
              >
                Go to Dashboard
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      {currentStep < 4 && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            disabled={currentStep === 1}
          >
            Back
          </Button>
          <Button
            onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}
            disabled={!canGoNext()}
          >
            {currentStep === 3 ? "Finish" : "Next"}
          </Button>
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
