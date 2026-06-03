import { Comment } from '../comment.entity';

export interface MentionedUserShape {
  id: number;
  username: string;
  fullName: string;
}

export interface CommentResponse extends Omit<Comment, 'mentionedUsers'> {
  mentionedUsers: MentionedUserShape[];
}
