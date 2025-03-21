import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonSet,
  Switch,
  ContentSwitcher,
  RadioTile,
  TileGroup,
  DataTableSkeleton,
  InlineLoading,
  InlineNotification,
} from '@carbon/react';
import {
  formatDatetime,
  useLayoutType,
  parseDate,
  ErrorState,
  toOmrsIsoString,
  toDateObjectStrict,
  showSnackbar,
  useSession,
  useLocations,
  type NewVisitPayload,
  saveVisit,
  useVisitTypes,
  useVisit,
  useConfig,
} from '@openmrs/esm-framework';
import { type Appointment, SearchTypes } from '../types';
import styles from './patient-scheduled-visits.scss';
import { useScheduledVisits } from './hooks/useScheduledVisits';
import isNil from 'lodash-es/isNil';
import { addQueueEntry } from './visit-form/queue.resource';
import { first } from 'rxjs/operators';
import { convertTime12to24 } from '../helpers/time-helpers';
import dayjs from 'dayjs';
import head from 'lodash-es/head';
import { useQueueLocations } from './hooks/useQueueLocations';
import { useQueues } from '../hooks/useQueues';
import { useMutateQueueEntries } from '../hooks/useMutateQueueEntries';
import { type ConfigObject } from '../config-schema';

enum visitType {
  RECENT = 'Recent',
  FUTURE = 'Future',
}

const ScheduledVisitsForVisitType: React.FC<{
  visits;
  visitType;
  scheduledVisitHeader;
  patientUuid;
  closeWorkspace: () => void;
}> = ({ visits, scheduledVisitHeader, patientUuid, closeWorkspace }) => {
  const { t } = useTranslation();
  const [visitsIndex, setVisitsIndex] = useState(0);
  const [hasPriority, setHasPriority] = useState(false);
  const [userLocation, setUserLocation] = useState('');
  const locations = useLocations();
  const session = useSession();
  const { queues, isLoading: isLoadingQueues } = useQueues(userLocation);
  const { mutateQueueEntries } = useMutateQueueEntries();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timeFormat = new Date().getHours() >= 12 ? 'PM' : 'AM';
  const visitDate = new Date();
  const visitTime = dayjs(new Date()).format('hh:mm');
  const [appointment, setAppointment] = useState<Appointment>();
  const [patientId, setPatientId] = useState('');
  const allVisitTypes = useVisitTypes();
  const { currentVisit } = useVisit(patientUuid);
  const config = useConfig<ConfigObject>();
  const visitQueueNumberAttributeUuid = config.visitQueueNumberAttributeUuid;
  const { queueLocations } = useQueueLocations();
  const selectedQueueLocation = queueLocations[0]?.id;

  // TODO: This needs fixing, we cannot just take the first queue and assume that is what is wanted
  const service = head(queues)?.uuid;
  const defaultStatus = config.concepts.defaultStatusConceptUuid;
  const priorities = queues.find((q) => q.uuid === service)?.allowedPriorities ?? [];

  useEffect(() => {
    if (!userLocation && session?.sessionLocation !== null) {
      setUserLocation(session?.sessionLocation?.uuid);
    } else if (!userLocation && locations) {
      setUserLocation(head(locations)?.uuid);
    }
  }, [session, locations, userLocation]);

  const handleSubmit = useCallback(
    (priority) => {
      setIsSubmitting(true);
      const [hours, minutes] = convertTime12to24(visitTime, timeFormat);
      const visitType = [...allVisitTypes].shift().uuid;

      const payload: NewVisitPayload = {
        patient: patientId,
        startDatetime: toDateObjectStrict(
          toOmrsIsoString(
            new Date(dayjs(visitDate).year(), dayjs(visitDate).month(), dayjs(visitDate).date(), hours, minutes),
          ),
        ),
        visitType: visitType,
        location: userLocation,
      };

      if (currentVisit) {
        showSnackbar({
          title: t('startVisitError', 'Error starting visit'),
          kind: 'error',
          isLowContrast: false,
          subtitle: t('patientHasActiveVisit', 'The patient already has an active visit'),
        });
        setIsSubmitting(false);
      } else {
        const abortController = new AbortController();

        saveVisit(payload, abortController)
        .then((response) => {
          if (response.status === 201) {
            return addQueueEntry(
              response.data.uuid,
              patientId,
              priority,
              defaultStatus,
              service,
              appointment,
              selectedQueueLocation,
              visitQueueNumberAttributeUuid,
            );
          } else {
            throw new Error(t('saveVisitFailed', 'Failed to save the visit.'));
          }
        })
        .then(({ status }) => {
          if (status === 201) {
            showSnackbar({
              kind: 'success',
              title: t('startAVisit', 'Start a visit'),
              subtitle: t(
                'startVisitQueueSuccessfully',
                'Patient has been added to active visits list and queue.',
                `${hours} : ${minutes}`,
              ),
            });
            closeWorkspace();
            mutateQueueEntries();
          }
        })
        .catch((error) => {
          showSnackbar({
            title: t('queueEntryError', 'Error adding patient to the queue'),
            kind: 'error',
            isLowContrast: false,
            subtitle: error.message,
          });
        })
        .finally(() => setIsSubmitting(false));
      }
    },
    [
      visitTime,
      timeFormat,
      allVisitTypes,
      patientId,
      visitDate,
      userLocation,
      queues,
      config.concepts.defaultStatusConceptUuid,
      config.concepts.defaultPriorityConceptUuid,
      currentVisit,
      t,
      priorities,
      appointment,
      selectedQueueLocation,
      visitQueueNumberAttributeUuid,
      closeWorkspace,
      mutateQueueEntries,
    ],
  );

  if (visits) {
    return (
      <div className={styles.row}>
        <p className={styles.heading}>{scheduledVisitHeader} </p>
        {visits?.length > 0 ? (
          <TileGroup name="tile-group" defaultSelected="default-selected">
            {visits?.map((visit, ind) => {
              return (
                <RadioTile
                  value={visit.uuid}
                  key={visit.uuid}
                  className={styles.visitTile}
                  onClick={(e) => {
                    setHasPriority(true);
                    setVisitsIndex(ind);
                    setPatientId(visit?.patient?.uuid);
                    setAppointment(visit);
                  }}>
                  <div className={styles.helperText}>
                    <p className={styles.primaryText}>{visit.service?.name}</p>
                    <p className={styles.secondaryText}>
                      {' '}
                      {formatDatetime(parseDate(visit?.startDateTime))} · {visit.location?.name}{' '}
                    </p>

                    {!visit.service ? (
                      <DataTableSkeleton />
                    ) : isLoadingQueues ? null : !priorities?.length ? (
                      <InlineNotification
                        className={styles.inlineNotification}
                        kind={'error'}
                        lowContrast
                        subtitle={t('configurePriorities', 'Please configure priorities to continue.')}
                        title={t('noPrioritiesConfigured', 'No priorities configured')}
                      />
                    ) : hasPriority && ind == visitsIndex ? (
                      <ContentSwitcher
                        size="sm"
                        selectedIndex={null}
                        className={styles.prioritySwitcher}
                        onChange={(e) => {
                          handleSubmit(e.name);
                        }}>
                        {priorities?.length > 0
                          ? priorities.map(({ uuid, display }) => {
                              return <Switch name={uuid} text={display} />;
                            })
                          : null}
                      </ContentSwitcher>
                    ) : null}
                    {hasPriority && ind == visitsIndex && isSubmitting ? (
                      <InlineLoading description={t('loading', 'Loading...')} />
                    ) : null}
                  </div>
                </RadioTile>
              );
            })}
          </TileGroup>
        ) : (
          <div className={styles.emptyAppointment}>
            <p>{t('noAppointmentsFound', 'No appointments found')} </p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={styles.emptyAppointment}>
      <p className={styles.heading}> {scheduledVisitHeader} </p>
    </div>
  );
};

interface PatientScheduledVisitsProps {
  toggleSearchType: (searchMode: SearchTypes, patientUuid, mode) => void;
  patientUuid: string;
  closeWorkspace: () => void;
}

const PatientScheduledVisits: React.FC<PatientScheduledVisitsProps> = ({
  toggleSearchType,
  patientUuid,
  closeWorkspace,
}) => {
  const { t } = useTranslation();
  const isTablet = useLayoutType() === 'tablet';
  const { appointments, isLoading, isError } = useScheduledVisits(patientUuid);

  if (isError) {
    return <ErrorState headerTitle={t('errorFetchingAppoinments', 'Error fetching appointments')} error={isError} />;
  }

  if (isLoading) {
    return <DataTableSkeleton role="progressbar" />;
  }

  if (isNil(appointments?.futureVisits) && isNil(appointments?.recentVisits)) {
    toggleSearchType(SearchTypes.VISIT_FORM, patientUuid, true);
  }

  return (
    <div className={styles.container}>
      <ScheduledVisitsForVisitType
        visitType={visitType.RECENT}
        visits={appointments?.recentVisits}
        scheduledVisitHeader={t('recentScheduledVisits', '{{count}} visit(s) scheduled for +/- 7 days', {
          count: appointments?.recentVisits?.length,
        })}
        patientUuid={patientUuid}
        closeWorkspace={closeWorkspace}
      />
      <ScheduledVisitsForVisitType
        visitType={visitType.FUTURE}
        visits={appointments?.futureVisits}
        scheduledVisitHeader={t('futureScheduledVisits', '{{count}} visit(s) scheduled for dates in the future', {
          count: appointments?.futureVisits?.length,
        })}
        patientUuid={patientUuid}
        closeWorkspace={closeWorkspace}
      />

      <div className={styles['text-divider']}>{t('orInProperFormat', 'Or')}</div>

      <div className={styles.buttonContainer}>
        <Button
          kind="ghost"
          iconDescription="Start another visit type"
          onClick={() => toggleSearchType(SearchTypes.VISIT_FORM, patientUuid, false)}>
          {t('anotherVisitType', 'Start another visit type')}
        </Button>
      </div>

      <ButtonSet className={isTablet ? styles.tablet : styles.desktop}>
        <Button
          className={styles.button}
          kind="secondary"
          onClick={() => toggleSearchType(SearchTypes.BASIC, patientUuid, false)}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button className={styles.button} kind="primary" type="submit">
          {t('search', 'Search')}
        </Button>
      </ButtonSet>
    </div>
  );
};

export default PatientScheduledVisits;
