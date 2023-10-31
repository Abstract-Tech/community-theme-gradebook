/* eslint-disable import/no-self-import, import/no-named-as-default-member */
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';

import { StrictDict } from 'utils';

import GRADE_OVERRIDE_HISTORY_ERROR_DEFAULT_MSG from 'data/constants/errors';

import grades from 'data/actions/grades';
import { sortAlphaAsc } from 'data/actions/utils';
import selectors from 'data/selectors';
import lms from 'data/services/lms';
import { get } from '../services/lms/utils'; // Adjust the import path as needed
import * as module from './grades';
import { getUrlPrefix } from '../services/lms/urls';

const { formatGradeOverrideForDisplay } = selectors.grades;

export const defaultAssignmentFilter = 'All';

export const fetchBulkUpgradeHistory = () => (dispatch) => (
  // todo add loading effect
  lms.api.fetch.gradeBulkOperationHistory().then(
    (response) => { dispatch(grades.bulkHistory.received(response)); },
  ).catch(() => dispatch(grades.bulkHistory.error()))
);

export const fetchGrades = (overrides = {}) => (
  (dispatch, getState) => {
    dispatch(grades.fetching.started());
    const { assignmentType, options } = overrides;
    const cohort = selectors.filters.cohort(getState());
    const track = selectors.filters.track(getState());
    const courseId = selectors.app.courseId(getState());
    const fetchOptions = {
      ...selectors.root.localFilters(getState()),
      ...options,
    };
    return lms.api.fetch.gradebookData(
      fetchOptions.searchText || null,
      cohort,
      track,
      fetchOptions,
    ).then(response => response.data)
      .then(async (data) => {
   console.log(data);
    // Extract an array of user IDs from data.results
    const userIDs = data.results.map((result) => result.user_id);
    console.log("userid");
    console.log(userIDs);
    // Fetch user full names based on user IDs using the "get" function
    const userFullNamePromises = userIDs.map(async (userID) => {
      try {
        const userResponse = await get(`${getUrlPrefix()}user/v1/users/${userID}`);
        const user = userResponse.data;
        return {
          userID,
          fullName: `${user.profile.first_name} ${user.profile.last_name}`,
        };
      } catch (error) {
        console.error(`Error fetching user ${userID}:`, error);
        return {
          userID,
          fullName: 'Unknown',
        };
      }
    });

    // Use Promise.all to wait for all user full name fetches to complete
    const userFullNames = await Promise.all(userFullNamePromises);

    // Combine user full names with the data
    const enrichedData = data.results.map((result) => {
      const userFullNameData = userFullNames.find((item) => item.userID === result.user_id);
      return {
        ...result,
        userFullName: userFullNameData ? userFullNameData.fullName : 'Unknown',
      };
    });


        dispatch(grades.fetching.received({
          assignmentType: (assignmentType || selectors.filters.assignmentType(getState())),
          cohort,
          courseId,
          track,
          grades: data.results.sort(sortAlphaAsc),
          prev: data.previous,
          next: data.next,
          totalUsersCount: data.total_users_count,
          filteredUsersCount: data.filtered_users_count,
        }));
        console.log(courseId);
        console.log('hi');
        if (fetchOptions.showSuccess) {
          dispatch(grades.banner.open());
        }
        dispatch(grades.fetching.finished());
      })
      .catch(() => {
        dispatch(grades.fetching.error());
      });
  }
);



export const fetchGradesIfAssignmentGradeFiltersSet = () => (
  (dispatch, getState) => {
    if (selectors.filters.areAssignmentGradeFiltersSet(getState())) {
      dispatch(module.fetchGrades());
    }
  }
);

export const fetchGradeOverrideHistory = (subsectionId, userId) => (
  dispatch => lms.api.fetch.gradeOverrideHistory(subsectionId, userId)
    .then(response => response.data)
    .then((data) => {
      if (data.success) {
        dispatch(grades.overrideHistory.received({
          overrideHistory: formatGradeOverrideForDisplay(data.history),
          currentEarnedAllOverride: data.override ? data.override.earned_all_override : null,
          currentPossibleAllOverride: data.override ? data.override.possible_all_override : null,
          currentEarnedGradedOverride: data.override ? data.override.earned_graded_override : null,
          currentPossibleGradedOverride: data.override
            ? data.override.possible_graded_override : null,
          originalGradeEarnedAll: data.original_grade ? data.original_grade.earned_all : null,
          originalGradePossibleAll: data.original_grade ? data.original_grade.possible_all : null,
          originalGradeEarnedGraded: data.original_grade
            ? data.original_grade.earned_graded : null,
          originalGradePossibleGraded: data.original_grade
            ? data.original_grade.possible_graded : null,
        }));
      } else {
        dispatch(grades.overrideHistory.error(data.error_message));
      }
    })
    .catch(() => {
      dispatch(grades.overrideHistory.error(GRADE_OVERRIDE_HISTORY_ERROR_DEFAULT_MSG));
    })
);

export const fetchPrevNextGrades = (endpoint) => (
  (dispatch, getState) => {
    dispatch(grades.fetching.started());
    return getAuthenticatedHttpClient().get(endpoint)
      .then(({ data }) => data)
      .then((data) => {
        dispatch(grades.fetching.received({
          courseId: selectors.app.courseId(getState()),
          cohort: selectors.filters.cohort(getState()),
          track: selectors.filters.track(getState()),
          assignmentType: selectors.filters.assignmentType(getState()),
          grades: data.results.sort(sortAlphaAsc),
          prev: data.previous,
          next: data.next,
          filteredUsersCount: data.filtered_users_count,
          totalUsersCount: data.total_users_count,
        }));
        dispatch(grades.fetching.finished());
      })
      .catch(() => {
        dispatch(grades.fetching.error());
      });
  }
);

export const submitImportGradesButtonData = (formData) => (
  (dispatch, getState) => {
    const courseId = selectors.app.courseId(getState());
    dispatch(grades.csvUpload.started());
    return lms.api.uploadGradeCsv(formData).then(() => {
      dispatch(grades.csvUpload.finished());
      dispatch(grades.uploadOverride.success(courseId));
    }).catch((error) => {
      dispatch(grades.uploadOverride.failure({ courseId, error }));
      if (error.status === 200 && error.data.error_messages.length) {
        const { error_messages: errorMessages, saved, total } = error.data;
        return dispatch(grades.csvUpload.error({ errorMessages, saved, total }));
      }
      return dispatch(grades.csvUpload.error({ errorMessages: ['Unknown error.'] }));
    });
  }
);

export const updateGrades = () => (
  (dispatch, getState) => {
    const updateData = selectors.app.editUpdateData(getState());
    dispatch(grades.update.request());
    return lms.api.updateGradebookData(updateData)
      .then(response => response.data)
      .then((data) => {
        dispatch(grades.update.success({ data }));
        dispatch(module.fetchGrades({
          assignmentType: defaultAssignmentFilter,
          options: { showSuccess: true },
        }));
      })
      .catch((error) => {
        dispatch(grades.update.failure({ error }));
      });
  }
);

export default StrictDict({
  fetchBulkUpgradeHistory,
  fetchGrades,
  fetchGradesIfAssignmentGradeFiltersSet,
  fetchGradeOverrideHistory,
  fetchPrevNextGrades,
  submitImportGradesButtonData,
  updateGrades,
});
