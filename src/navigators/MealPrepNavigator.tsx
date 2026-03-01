import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MealPrepEventListScreen from '../screens/mealprep/MealPrepEventListScreen';
import MealPrepEventListV2Screen from '../screens/mealprep/MealPrepEventListV2Screen';
import MealPrepEventDetailScreen from '../screens/mealprep/MealPrepEventDetailScreen';
import MealPrepEventDetailV2Screen from '../screens/mealprep/MealPrepEventDetailV2Screen';
import EditMealPrepEventScreen from '../screens/mealprep/EditMealPrepEventScreen';
import EventChatScreen from '../screens/mealprep/EventChatScreen';
import EventMapScreen from '../screens/mealprep/EventMapScreen';
import MyMealPrepEventsScreen from '../screens/mealprep/MyMealPrepEventsScreen';
import AddCommentScreen from '../screens/mealprep/AddCommentScreen';
import ReplyToCommentScreen from '../screens/mealprep/ReplyToCommentScreen';

// Wizard screens (legacy)
import CreateEventWizardScreen from '../screens/mealprep/create/CreateEventWizardScreen';
import Step1CoreDetailsScreen from '../screens/mealprep/create/Step1CoreDetailsScreen';
import Step2RecipeMenuScreen from '../screens/mealprep/create/Step2RecipeMenuScreen';
import Step3LocationScreen from '../screens/mealprep/create/Step3LocationScreen';
import Step4ContributionsScreen from '../screens/mealprep/create/Step4ContributionsScreen';
import EventPreviewScreen from '../screens/mealprep/create/EventPreviewScreen';

// V2 creation form
import CreateEventFormScreen from '../screens/mealprep/create/CreateEventFormScreen';
import EventPreviewV2Screen from '../screens/mealprep/create/EventPreviewV2Screen';

export type MealPrepStackParamList = {
  MealPrepEventList: undefined;
  MealPrepEventDetail: { eventId: string; inviteToken?: string; invitedMode?: boolean; notificationId?: number };
  EditMealPrepEvent: { eventId: string };
  EventChat: { eventId: string; eventTitle: string };
  EventMap: undefined;
  MyMealPrepEvents: undefined;

  // Comment screens
  AddComment: { eventId: string };
  ReplyToComment: {
    eventId: string;
    parentCommentId: string;
    parentAuthor: string;
    parentContent: string;
  };

  // V2 creation form
  CreateEventForm: { draftId?: string } | undefined;
  EventPreviewV2: { draftId: string };

  // Legacy wizard routes (kept for backward compat)
  CreateEventWizard: { draftId?: string; templateId?: string } | undefined;
  CreateEventStep1: { draftId: string };
  CreateEventStep2: { draftId: string };
  CreateEventStep3: { draftId: string };
  CreateEventStep4: { draftId: string };
  EventPreview: { draftId: string };
};

const Stack = createNativeStackNavigator<MealPrepStackParamList>();

const MealPrepNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MealPrepEventList" component={MealPrepEventListV2Screen} />
      <Stack.Screen name="MealPrepEventDetail" component={MealPrepEventDetailV2Screen} />
      <Stack.Screen name="EditMealPrepEvent" component={EditMealPrepEventScreen} />
      <Stack.Screen name="EventChat" component={EventChatScreen} />
      <Stack.Screen name="EventMap" component={EventMapScreen} />
      <Stack.Screen name="MyMealPrepEvents" component={MyMealPrepEventsScreen} />

      {/* Comment screens */}
      <Stack.Screen name="AddComment" component={AddCommentScreen} />
      <Stack.Screen name="ReplyToComment" component={ReplyToCommentScreen} />

      {/* V2 creation form */}
      <Stack.Screen name="CreateEventForm" component={CreateEventFormScreen} />
      <Stack.Screen name="EventPreviewV2" component={EventPreviewV2Screen} />

      {/* Legacy wizard screens */}
      <Stack.Screen name="CreateEventWizard" component={CreateEventWizardScreen} />
      <Stack.Screen name="CreateEventStep1" component={Step1CoreDetailsScreen} />
      <Stack.Screen name="CreateEventStep2" component={Step2RecipeMenuScreen} />
      <Stack.Screen name="CreateEventStep3" component={Step3LocationScreen} />
      <Stack.Screen name="CreateEventStep4" component={Step4ContributionsScreen} />
      <Stack.Screen name="EventPreview" component={EventPreviewScreen} />
    </Stack.Navigator>
  );
};

export default MealPrepNavigator; 