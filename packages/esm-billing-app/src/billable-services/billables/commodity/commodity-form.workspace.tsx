import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonSet, Button, Stack, Toggle, InlineNotification, InlineLoading } from '@carbon/react';
import { Add } from '@carbon/react/icons';
import { useForm, FormProvider, useFieldArray, Controller } from 'react-hook-form';

import { useLayoutType, ResponsiveWrapper, showSnackbar, restBaseUrl } from '@openmrs/esm-framework';
import styles from './commodity-form.scss';
import StockItemSearch from './stock-search.component';
import classNames from 'classnames';
import { zodResolver } from '@hookform/resolvers/zod';
import PriceField from '../services/price.component';
import { billableFormSchema, BillableFormSchema } from '../form-schemas';
import { formatBillableServicePayloadForSubmission, mapInputToPayloadSchema } from '../form-helper';
import { createBillableService } from '../../billable-service.resource';
import { handleMutate } from '../../utils';

import LeftPanel from '../../../left-panel/left-panel.component';

const CommodityForm: React.FC<{editingService?: any; onClose: () => void; mutate?: () => void}> = ({
  editingService,
  onClose
}) => {
  const { t } = useTranslation();
  const isTablet = useLayoutType() === 'tablet';
  const formMethods = useForm<BillableFormSchema>({
    resolver: zodResolver(billableFormSchema),
    defaultValues: editingService
      ? mapInputToPayloadSchema(editingService)
      : { servicePrices: [], serviceStatus: 'ENABLED' },
  });

  const {
    setValue,
    control,
    handleSubmit,
    formState: { errors,isSubmitting },
  } = formMethods;

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'servicePrices',
  });

  const onSubmit = async (formValues: BillableFormSchema) => {
    const payload = formatBillableServicePayloadForSubmission(formValues, editingService?.['uuid']);
    try {
      const response = await createBillableService(payload);
      if (response.ok) {
        showSnackbar({
          title: t('commodityBillableCreated', 'Commodity price created successfully'),
          subtitle: t('commodityBillableCreatedSubtitle', 'The commodity price has been created successfully'),
          kind: 'success',
          isLowContrast: true,
          timeoutInMs: 5000,
        });
        handleMutate(`${restBaseUrl}/billing/billableService?v`);
        onClose()
      }
    } catch (e) {
      showSnackbar({
        title: t('commodityBillableCreationFailed', 'Commodity price creation failed'),
        subtitle: t('commodityBillableCreationFailedSubtitle', 'The commodity price creation failed'),
        kind: 'error',
        isLowContrast: true,
        timeoutInMs: 5000,
      });
    }
  };

  const renderServicePriceFields = useMemo(
    () =>
      fields.map((field, index) => (
        <PriceField
          key={field.id}
          field={field}
          index={index}
          control={control}
          removeServicePrice={remove}
          errors={errors}
        />
      )),
    [fields, control, remove, errors],
  );

  const handleError = (err) => {
    console.error(JSON.stringify(err, null, 2));
    showSnackbar({
      title: t('commodityBillableCreationFailed', 'Commodity price creation failed'),
      subtitle: t(
        'commodityBillableCreationFailedSubtitle',
        'The commodity price creation failed, view browser console for more details',
      ),
      kind: 'error',
      isLowContrast: true,
      timeoutInMs: 5000,
    });
  };

  return (
    <>
    <FormProvider {...formMethods}>
      <form onSubmit={handleSubmit(onSubmit, handleError)} className={styles.form}>
        <div className={styles.formContainer}>
          <Stack className={styles.formStackControl} gap={7}>
            <StockItemSearch setValue={setValue} defaultStockItem={editingService?.name} />
            <ResponsiveWrapper>
              <Controller
                control={control}
                name="serviceStatus"
                render={({ field }) => (
                  <Toggle
                    labelText={t('status', 'Status')}
                    labelA="Off"
                    labelB="On"
                    defaultToggled={field.value === 'ENABLED'}
                    id="serviceStatus"
                    onToggle={(value) => (value ? field.onChange('ENABLED') : field.onChange('DISABLED'))}
                  />
                )}
              />
            </ResponsiveWrapper>
            {renderServicePriceFields}
            <Button size="sm" kind="tertiary" renderIcon={Add} onClick={() => append({})}>
              {t('addPaymentMethod', 'Add payment method')}
            </Button>
            {!!errors.servicePrices && (
              <InlineNotification
                aria-label="closes notification"
                kind="error"
                lowContrast={true}
                statusIconDescription="notification"
                title={t('paymentMethodRequired', 'Payment method required')}
                subTitle={t('atLeastOnePriceRequired', 'At least one price is required')}
              />
            )}
          </Stack>
        </div>
        <ButtonSet className={classNames({ [styles.tablet]: isTablet, [styles.desktop]: !isTablet })}>
          <Button style={{ maxWidth: '50%' }} kind="secondary" onClick={onClose}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button disabled={isSubmitting} style={{ maxWidth: '50%' }} kind="primary" type="submit">
            {isSubmitting ? (
              <span style={{ display: 'flex', justifyItems: 'center' }}>
                {t('submitting', 'Submitting...')} <InlineLoading status="active" iconDescription="Loading" />
              </span>
            ) : (
              t('saveAndClose', 'Save & close')
            )}
          </Button>
        </ButtonSet>
      </form>
    </FormProvider>
    </>
  );
};

export default CommodityForm;
